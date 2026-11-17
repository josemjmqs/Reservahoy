import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MAX_SERVICES_PER_BOOKING } from './booking-limits';
import { findMemberSlots } from './member-slots';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getSlots(
    slug: string,
    serviceIds: string[],
    date: string,
    memberId?: string,
  ) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) throw new NotFoundException('Negocio no encontrado');

    const services = await this.resolveServices(business.id, serviceIds);
    const { durationMin, stepMin } = blockFor(services);

    const day = DateTime.fromISO(date, { zone: business.timezone });
    if (!day.isValid) return { slots: [] as string[] };

    const members = await this.membersForServices(
      business.id,
      services.map((s) => s.id),
      memberId,
    );

    const weekday = day.weekday % 7;
    const dayStart = day.startOf('day').toJSDate();
    const dayEnd = day.endOf('day').toJSDate();
    const all = new Set<string>();

    for (const m of members) {
      const slots = await this.slotsForMember(
        m.id,
        business.id,
        business.timezone,
        date,
        weekday,
        dayStart,
        dayEnd,
        durationMin,
        stepMin,
      );
      slots.forEach((s) => all.add(s));
    }
    return { slots: [...all].sort() };
  }

  // Horas libres de un profesional concreto (también la usa bookings)
  async slotsForMember(
    memberId: string,
    businessId: string,
    timezone: string,
    date: string,
    weekday: number,
    dayStart: Date,
    dayEnd: Date,
    durationMin: number,
    stepMin?: number,
  ): Promise<string[]> {
    return findMemberSlots(this.prisma, {
      memberId,
      businessId,
      timezone,
      date,
      weekday,
      dayStart,
      dayEnd,
      durationMin,
      stepMin,
    });
  }

  // Servicios pedidos en el orden del cliente y sin repetidos. Todos deben estar
  // activos y ser de este negocio (también la usa bookings)
  async resolveServices(businessId: string, serviceIds: string[]) {
    const ids = [...new Set(serviceIds)];
    if (!ids.length)
      throw new BadRequestException('Elige al menos un servicio');
    if (ids.length > MAX_SERVICES_PER_BOOKING) {
      throw new BadRequestException(
        `Puedes elegir hasta ${MAX_SERVICES_PER_BOOKING} servicios por reserva`,
      );
    }
    const found = await this.prisma.service.findMany({
      where: { id: { in: ids }, businessId, active: true },
    });
    if (found.length !== ids.length) {
      throw new NotFoundException('Servicio no encontrado');
    }
    const byId = new Map(found.map((s) => [s.id, s]));
    return ids.map((id) => byId.get(id)!);
  }

  // Profesionales que hacen TODOS los servicios (uno solo los hace seguidos)
  membersForServices(
    businessId: string,
    serviceIds: string[],
    memberId?: string,
  ) {
    return this.prisma.member.findMany({
      where: {
        businessId,
        active: true,
        bookable: true,
        ...(memberId && { id: memberId }),
        AND: serviceIds.map((serviceId) => ({
          services: { some: { serviceId } },
        })),
      },
      select: { id: true },
    });
  }

  async getBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      select: {
        name: true,
        slug: true,
        timezone: true,
        phone: true,
        address: true,
        brandColor: true,
        logoKey: true,
        services: {
          where: { active: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            durationMin: true,
            totalMin: true,
            price: true,
            imageKey: true,
          },
        },
        members: {
          where: { active: true, bookable: true },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            displayName: true,
            services: { select: { serviceId: true } },
          },
        },
      },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    const [acceptsBookings, todayHours] = await Promise.all([
      this.acceptsBookings({ slug }),
      this.todayHours(
        { slug, timezone: business.timezone },
        business.members.map((m) => m.id),
      ),
    ]);
    const services = business.services.map(({ imageKey, ...s }) => ({
      ...s,
      imageUrl: this.storage.urlFor(imageKey),
    }));
    const { logoKey, ...rest } = business;
    return {
      ...rest,
      logoUrl: this.storage.urlFor(logoKey),
      services,
      acceptsBookings,
      todayHours,
    };
  }

  // Horario de hoy del negocio para su página pública ("Hoy atiende de 10:00 a
  // 19:00"): desde la primera apertura hasta el último cierre de los
  // profesionales que atienden hoy. No cuenta a quien tiene un bloqueo (suyo o
  // de todo el negocio) que cubre todo su horario de hoy; si nadie atiende, null.
  // El almuerzo no corta el rango: es un resumen, las horas reales las da
  // getSlots
  async todayHours(
    business: { slug: string; timezone: string },
    memberIds: string[],
    now: DateTime = DateTime.now(),
  ): Promise<{ opensAt: string; closesAt: string } | null> {
    if (memberIds.length === 0) return null;
    const today = now.setZone(business.timezone).startOf('day');
    const [hours, blocks] = await Promise.all([
      this.prisma.workingHours.findMany({
        where: { memberId: { in: memberIds }, weekday: today.weekday % 7 },
        select: { memberId: true, opensAt: true, closesAt: true },
      }),
      this.prisma.timeBlock.findMany({
        where: {
          business: { slug: business.slug },
          startsAt: { lt: today.plus({ days: 1 }).toJSDate() },
          endsAt: { gt: today.toJSDate() },
        },
        select: { memberId: true, startsAt: true, endsAt: true },
      }),
    ]);
    const at = (hhmm: string) => {
      const [hour, minute] = hhmm.split(':').map(Number);
      return today.set({ hour, minute }).toJSDate();
    };
    const working = hours.filter(
      (h) =>
        !blocks.some(
          (b) =>
            (b.memberId === null || b.memberId === h.memberId) &&
            b.startsAt <= at(h.opensAt) &&
            b.endsAt >= at(h.closesAt),
        ),
    );
    if (working.length === 0) return null;
    // "HH:mm" se ordena igual como texto que como hora
    return {
      opensAt: working.map((h) => h.opensAt).sort()[0],
      closesAt: working
        .map((h) => h.closesAt)
        .sort()
        .at(-1)!,
    };
  }

  // Un negocio recibe reservas solo cuando un dueño activo verificó el correo:
  // evita que una cuenta falsa use la plataforma para enviar correos a terceros.
  // Un dueño invitado entra verificado, pero solo invita un dueño verificado
  async acceptsBookings(business: { id: string } | { slug: string }) {
    const verifiedOwners = await this.prisma.member.count({
      where: {
        business,
        role: 'OWNER',
        active: true,
        user: { emailVerifiedAt: { not: null } },
      },
    });
    return verifiedOwners > 0;
  }
}

// Bloque de agenda para varios servicios seguidos: dura la suma, y las horas se
// ofrecen cada "servicio más corto" (con uno solo, igual que siempre: su duración)
export function blockFor(services: { durationMin: number }[]) {
  const durations = services.map((s) => s.durationMin);
  return {
    durationMin: durations.reduce((a, b) => a + b, 0),
    stepMin: Math.min(...durations),
  };
}
