import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import * as Sentry from '@sentry/nestjs';
import { getMembership, isOwner, scopeMemberId } from '../auth/membership';
import { NotificationsService } from '../notifications/notifications.service';
import type { EmailPhoto } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageType } from '../storage/image-type';

// Fotos que se pueden mandar en el correo de "servicio listo"
export const MAX_COMPLETED_PHOTOS = 4;

// Estados desde los que marcar Completada avisa al cliente: las activas y las
// marcadas "No se presentó" (pudo ser un error: el cliente sí vino). La misma
// regla que canComplete en el frontend (lib/types.ts): shared-rules.spec.ts
export const COMPLETABLE: BookingStatus[] = ['PENDING', 'CONFIRMED', 'NO_SHOW'];

const BOOKING_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  items: {
    orderBy: { position: 'asc' },
    select: { service: { select: { name: true, durationMin: true } } },
  },
  customer: { select: { name: true, email: true, phone: true } },
  member: { select: { id: true, displayName: true } },
} satisfies Prisma.BookingSelect;

type SelectedBooking = Prisma.BookingGetPayload<{
  select: typeof BOOKING_SELECT;
}>;

// La API responde los servicios planos (en orden) en vez de los items
const toAgendaBooking = ({ items, ...b }: SelectedBooking) => ({
  ...b,
  services: items.map((i) => i.service),
});

@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Si se filtra por profesional, debe ser de tu negocio (404 si no)
  private async assertMember(businessId: string, memberId?: string) {
    if (!memberId) return;
    const target = await this.prisma.member.findFirst({
      where: { id: memberId, businessId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Profesional no encontrado');
  }

  // Negocio y profesional que se consultan: un profesional (STAFF) solo ve
  // sus propias reservas
  private async scope(userId: string, requested?: string) {
    const m = await getMembership(this.prisma, userId);
    const memberId = scopeMemberId(m, requested);
    await this.assertMember(m.businessId, memberId);
    return { businessId: m.businessId, timezone: m.timezone, memberId };
  }

  async list(userId: string, from: string, to: string, requested?: string) {
    const { businessId, timezone, memberId } = await this.scope(
      userId,
      requested,
    );

    const start = DateTime.fromISO(from, { zone: timezone }).startOf('day');
    const end = DateTime.fromISO(to, { zone: timezone }).endOf('day');

    const bookings = await this.prisma.booking.findMany({
      where: {
        businessId,
        ...(memberId && { memberId }),
        startsAt: { gte: start.toJSDate(), lte: end.toJSDate() },
      },
      orderBy: { startsAt: 'asc' },
      select: BOOKING_SELECT,
    });
    return bookings.map(toAgendaBooking);
  }

  // Próxima reserva activa (pendiente o confirmada) que aún no empieza.
  // Se envuelve en { booking } porque Nest responde un null como cuerpo vacío
  async next(userId: string, requested?: string, now = new Date()) {
    const { businessId, memberId } = await this.scope(userId, requested);

    const booking = await this.prisma.booking.findFirst({
      where: {
        businessId,
        ...(memberId && { memberId }),
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { gt: now },
      },
      orderBy: { startsAt: 'asc' },
      select: BOOKING_SELECT,
    });
    return { booking: booking ? toAgendaBooking(booking) : null };
  }

  // Un profesional solo cambia sus propias reservas; las de otro, 404
  private async findScoped(userId: string, id: string) {
    const m = await getMembership(this.prisma, userId);
    const booking = await this.prisma.booking.findFirst({
      where: {
        id,
        businessId: m.businessId,
        ...(!isOwner(m) && { memberId: m.memberId }),
      },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException('Reserva no encontrada');
    return booking;
  }

  async updateStatus(
    userId: string,
    id: string,
    status: string,
    reason?: string,
  ) {
    await this.findScoped(userId, id);

    if (status === 'CANCELLED') {
      // Solo quien pasa la reserva de activa a cancelada avisa al cliente, así
      // no le llegan dos correos si se cancela dos veces al mismo tiempo
      const { count } = await this.prisma.booking.updateMany({
        where: { id, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED' },
      });
      if (count === 1) {
        void this.notifyCancelled(id, reason?.trim() || null);
        return { id, status: 'CANCELLED' as const };
      }
    }

    if (status === 'COMPLETED' && (await this.markCompleted(id, []))) {
      return { id, status: 'COMPLETED' as const };
    }

    try {
      return await this.prisma.booking.update({
        where: { id },
        data: { status: status as Prisma.BookingUpdateInput['status'] },
        select: { id: true, status: true },
      });
    } catch (e) {
      // Reactivar una reserva cancelada puede chocar con otra que tomó su hora
      if (e instanceof Error && e.message.includes('booking_no_overlap')) {
        throw new ConflictException('Esa hora ya fue tomada por otra reserva');
      }
      throw e;
    }
  }

  // Completar desde el diálogo de la agenda, con fotos opcionales (JPG, PNG o
  // WebP, validadas por sus bytes) que van dentro del correo de "servicio
  // listo". No se guardan: el bucket es público y son fotos de cosas del
  // cliente. `notified` dice si se le escribió (no, si ya estaba completada o
  // cancelada)
  async complete(userId: string, id: string, files: { buffer: Buffer }[] = []) {
    await this.findScoped(userId, id);
    if (files.length > MAX_COMPLETED_PHOTOS) {
      throw new BadRequestException(
        `Puedes enviar hasta ${MAX_COMPLETED_PHOTOS} fotos`,
      );
    }
    const photos = files.map((f) => {
      const type = detectImageType(f.buffer);
      if (!type) {
        throw new BadRequestException('Las fotos deben ser JPG, PNG o WebP');
      }
      return { content: f.buffer, ...type };
    });

    const done = await this.markCompleted(id, photos);
    if (done) return { id, status: 'COMPLETED' as const, ...done };
    // Cancelada o ya completada: queda completada sin avisar, como con PATCH
    // status
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: 'COMPLETED' },
      select: { id: true, status: true },
    });
    return { ...updated, notified: false };
  }

  // Igual que al cancelar: solo quien pasa la reserva a completada (desde
  // activa o "No se presentó") le avisa al cliente, así el correo sale una
  // vez. null si estaba cancelada o ya completada
  private async markCompleted(id: string, photos: EmailPhoto[]) {
    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: { in: COMPLETABLE } },
      data: { status: 'COMPLETED' },
    });
    if (count !== 1) return null;
    void this.notifyCompleted(id, photos);
    return { notified: true };
  }

  // Correo al cliente de que su servicio está listo. Nunca lanza: un fallo
  // aquí no debe deshacer la reserva completada
  private async notifyCompleted(id: string, photos: EmailPhoto[]) {
    try {
      const b = await this.prisma.booking.findUniqueOrThrow({
        where: { id },
        select: {
          customer: { select: { name: true, email: true } },
          business: {
            select: { name: true, phone: true, address: true },
          },
          items: {
            orderBy: { position: 'asc' },
            select: { service: { select: { name: true } } },
          },
        },
      });
      await this.notifications.bookingCompleted({
        to: b.customer.email,
        customerName: b.customer.name,
        businessName: b.business.name,
        businessPhone: b.business.phone,
        businessAddress: b.business.address,
        serviceName: b.items.map((i) => i.service.name).join(' + '),
        photos,
      });
    } catch (e) {
      Sentry.captureException(e);
      this.logger.error(
        'Error avisando que el servicio está listo',
        e as Error,
      );
    }
  }

  // Correo al cliente cuando el negocio cancela su reserva. Nunca lanza: un
  // fallo aquí no debe deshacer ni romper la cancelación
  private async notifyCancelled(id: string, reason: string | null) {
    try {
      const b = await this.prisma.booking.findUniqueOrThrow({
        where: { id },
        select: {
          startsAt: true,
          customer: { select: { name: true, email: true } },
          business: {
            select: { name: true, slug: true, phone: true, timezone: true },
          },
          items: {
            orderBy: { position: 'asc' },
            select: { service: { select: { name: true } } },
          },
        },
      });
      await this.notifications.bookingCancelledByBusiness({
        to: b.customer.email,
        customerName: b.customer.name,
        businessName: b.business.name,
        businessSlug: b.business.slug,
        businessPhone: b.business.phone,
        serviceName: b.items.map((i) => i.service.name).join(' + '),
        startsAt: b.startsAt,
        timezone: b.business.timezone,
        reason,
      });
    } catch (e) {
      Sentry.captureException(e);
      this.logger.error('Error avisando la cancelación', e as Error);
    }
  }
}
