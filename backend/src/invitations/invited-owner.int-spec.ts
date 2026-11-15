import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AgendaService } from '../agenda/agenda.service';
import { getMembership } from '../auth/membership';
import type { AvailabilityService } from '../availability/availability.service';
import { BookingsService } from '../bookings/bookings.service';
import { BusinessService } from '../business/business.service';
import { MembersService } from '../members/members.service';
import type {
  CancelledByBusinessEmailData,
  MemberInvitationEmailData,
  NewBookingEmailData,
  NotificationsService,
} from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import { SettingsService } from '../settings/settings.service';
import type { StorageService } from '../storage/storage.service';
import { TimeBlocksService } from '../time-blocks/time-blocks.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { InvitationsService } from './invitations.service';

// Qué puede hacer quien entró al negocio aceptando una invitación: por ahora es
// un segundo dueño (OWNER), con los mismos permisos que la dueña que lo invitó.
// Socia acepta la invitación en beforeAll; Beto es un profesional sin cuenta.
// Las reglas del rol limitado (STAFF) están en staff-permissions.int-spec.ts
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
// Correos simulados: se anotan en vez de enviarse
const mail = {
  invitations: [] as MemberInvitationEmailData[],
  cancelled: [] as CancelledByBusinessEmailData[],
  newBooking: [] as NewBookingEmailData[],
};
const notifications = {
  memberInvitation: (d: MemberInvitationEmailData) => {
    mail.invitations.push(d);
    return Promise.resolve();
  },
  bookingCancelledByBusiness: (d: CancelledByBusinessEmailData) => {
    mail.cancelled.push(d);
    return Promise.resolve();
  },
  newBookingForStaff: (d: NewBookingEmailData) => {
    mail.newBooking.push(d);
    return Promise.resolve();
  },
} as unknown as NotificationsService;
// El aviso de cancelación sale en segundo plano: espera a que llegue
const settle = () => new Promise((r) => setTimeout(r, 300));
// Sin R2: la subida de fotos responde 503 a un dueño (403 sería falta de permiso)
const storage = {
  enabled: false,
  urlFor: () => null,
} as unknown as StorageService;

const invitations = new InvitationsService(
  db,
  notifications,
  new JwtService({ secret: 'test-invited-owner' }),
);
const agenda = new AgendaService(db, notifications);
const bookings = new BookingsService(
  db,
  {} as AvailabilityService,
  notifications,
);
const business = new BusinessService(db, storage);
const hours = new WorkingHoursService(db);
const blocks = new TimeBlocksService(db);
const services = new ServicesService(db, storage);
const members = new MembersService(db);
const settings = new SettingsService(db);
const run = Date.now().toString(36);
const email = (x: string) => `invited-owner-${x}-${run}@test.local`;

let businessId: string;
let ownerUserId: string;
let ownerId: string;
let sociaUserId: string;
let sociaId: string;
let betoId: string;
let serviceId: string;
let ownerBookingId: string;
let betoBookingId: string;
let ownerBlockId: string;

const at = (iso: string) => new Date(iso);
const range = ['2033-02-28', '2033-03-02'] as const;
const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();

beforeAll(async () => {
  businessId = (
    await prisma.business.create({
      data: { name: 'Socias', slug: `int-invited-owner-${run}` },
    })
  ).id;
  // Solo una dueña con el correo verificado puede invitar
  ownerUserId = (
    await prisma.user.create({
      data: {
        email: email('owner'),
        name: 'Dueña',
        password: 'x',
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
  ownerId = (
    await prisma.member.create({
      data: {
        role: 'OWNER',
        newBookingsScope: 'ALL', // como al registrarse
        displayName: 'Dueña',
        userId: ownerUserId,
        businessId,
      },
    })
  ).id;
  [sociaId, betoId] = await Promise.all(
    ['Socia', 'Beto'].map(
      async (displayName) =>
        (
          await prisma.member.create({
            data: { role: 'STAFF', displayName, businessId },
          })
        ).id,
    ),
  );
  serviceId = (
    await prisma.service.create({
      data: { name: 'Corte', durationMin: 30, businessId },
    })
  ).id;
  await prisma.workingHours.createMany({
    data: [ownerId, betoId].map((memberId) => ({
      weekday: 1,
      opensAt: '09:00',
      closesAt: '18:00',
      memberId,
    })),
  });
  const customerId = (
    await prisma.customer.create({
      data: { name: 'C', email: email('c'), businessId },
    })
  ).id;
  const book = async (memberId: string, hour: string) =>
    (
      await prisma.booking.create({
        data: {
          startsAt: at(`2033-03-01T${hour}:00Z`),
          endsAt: at(`2033-03-01T${hour}:30Z`),
          businessId,
          memberId,
          customerId,
          items: { create: { serviceId, position: 0 } },
        },
      })
    ).id;
  ownerBookingId = await book(ownerId, '13');
  betoBookingId = await book(betoId, '15');
  ownerBlockId = (
    await prisma.timeBlock.create({
      data: {
        startsAt: at('2033-05-01T12:00:00Z'),
        endsAt: at('2033-05-01T14:00:00Z'),
        businessId,
        memberId: ownerId,
      },
    })
  ).id;

  // La dueña invita a Socia y Socia acepta desde el enlace del correo
  await invitations.create(ownerUserId, sociaId, email('socia'));
  await invitations.accept(mail.invitations[0].token, 'Socia', 'clave-segura');
  sociaUserId = (
    await prisma.user.findUniqueOrThrow({ where: { email: email('socia') } })
  ).id;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { businessId } }); // ítems en cascada
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.timeBlock.deleteMany({ where: { businessId } });
  await prisma.workingHours.deleteMany({ where: { member: { businessId } } });
  await prisma.service.deleteMany({ where: { businessId } }); // MemberService en cascada
  await prisma.member.deleteMany({ where: { businessId } }); // invitaciones en cascada
  await prisma.user.deleteMany({
    where: {
      email: { startsWith: 'invited-owner-', endsWith: `-${run}@test.local` },
    },
  });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('al aceptar la invitación', () => {
  it('queda como dueño del negocio, con el correo verificado', async () => {
    const m = await getMembership(db, sociaUserId);
    expect(m).toMatchObject({ memberId: sociaId, businessId, role: 'OWNER' });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sociaUserId },
    });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('agenda', () => {
  it('ve las reservas de todo el negocio y filtra por profesional', async () => {
    expect(ids(await agenda.list(sociaUserId, ...range))).toEqual(
      [ownerBookingId, betoBookingId].sort(),
    );
    expect(ids(await agenda.list(sociaUserId, ...range, betoId))).toEqual([
      betoBookingId,
    ]);
    const { booking } = await agenda.next(
      sociaUserId,
      betoId,
      at('2033-01-01'),
    );
    expect(booking?.id).toBe(betoBookingId);
  });

  it('cancela la reserva de otro profesional y el cliente recibe el aviso', async () => {
    await settle();
    mail.cancelled.length = 0;
    const res = await agenda.updateStatus(
      sociaUserId,
      betoBookingId,
      'CANCELLED',
      'Beto está enfermo',
    );
    expect(res.status).toBe('CANCELLED');
    await settle();
    expect(mail.cancelled).toHaveLength(1);
    expect(mail.cancelled[0]).toMatchObject({
      to: email('c'),
      reason: 'Beto está enfermo',
    });
  });

  it('recibe el aviso de las reservas nuevas de todo el negocio', async () => {
    mail.newBooking.length = 0;
    await bookings.notifyStaff(ownerBookingId);
    expect(mail.newBooking.map((m) => m.to).sort()).toEqual(
      [email('owner'), email('socia')].sort(),
    );
  });
});

describe('horario y bloqueos', () => {
  it('ve y cambia el horario de otro profesional y el de la dueña', async () => {
    // Sin memberId, el suyo (todavía vacío); con él, el de cualquiera
    expect(await hours.findAll(sociaUserId)).toEqual([]);
    for (const memberId of [betoId, ownerId]) {
      expect((await hours.findAll(sociaUserId, memberId)).length).toBe(1);
    }
    const days = [{ weekday: 2, opensAt: '10:00', closesAt: '14:00' }];
    for (const memberId of [betoId, ownerId]) {
      const saved = await hours.replace(sociaUserId, { memberId, days });
      expect(saved.map((h) => [h.weekday, h.opensAt])).toEqual([[2, '10:00']]);
    }
  });

  it('bloquea a todo el negocio y borra el bloqueo de la dueña', async () => {
    const day = {
      startDate: '2033-06-01',
      endDate: '2033-06-01',
      allDay: true,
    };
    const all = await blocks.create(sociaUserId, day);
    expect(all.member).toBeNull();
    const beto = await blocks.create(sociaUserId, { ...day, memberId: betoId });
    expect(beto.member?.id).toBe(betoId);
    expect(ids((await blocks.list(sociaUserId)).blocks)).toEqual(
      [ownerBlockId, all.id, beto.id].sort(),
    );
    expect(await blocks.remove(sociaUserId, ownerBlockId)).toEqual({
      id: ownerBlockId,
    });
  });
});

describe('servicios, equipo y datos del negocio', () => {
  it('crea, cambia y desactiva servicios (el nuevo queda solo con ella)', async () => {
    const created = await services.create(sociaUserId, {
      name: 'Barba',
      durationMin: 20,
    });
    const assigned = await prisma.memberService.findMany({
      where: { serviceId: created.id },
      select: { memberId: true },
    });
    expect(assigned.map((a) => a.memberId)).toEqual([sociaId]);
    expect(
      (await services.update(sociaUserId, serviceId, { price: 12000 })).price,
    ).toBe(12000);
    expect((await services.deactivate(sociaUserId, created.id)).active).toBe(
      false,
    );
    // Pasa la revisión de rol y se detiene en que no hay R2 (503, no 403)
    await expect(
      services.setImage(sociaUserId, serviceId, { buffer: Buffer.from('x') }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('agrega profesionales y les cambia servicios', async () => {
    const caro = await members.create(sociaUserId, { displayName: 'Caro' });
    await members.update(sociaUserId, betoId, { serviceIds: [serviceId] });
    const list = await members.list(sociaUserId);
    expect(list.map((m) => m.displayName)).toContain('Caro');
    expect(list.find((m) => m.id === betoId)?.services).toEqual([
      { serviceId },
    ]);
    expect(caro.id).toBeTruthy();
  });

  it('invita a otro profesional, ve el correo invitado y anula la invitación', async () => {
    const dani = await members.create(sociaUserId, { displayName: 'Dani' });
    await invitations.create(sociaUserId, dani.id, email('dani'));
    expect(mail.invitations.at(-1)).toMatchObject({
      to: email('dani'),
      inviterName: 'Socia',
    });
    const listed = (await members.list(sociaUserId)).find(
      (m) => m.id === dani.id,
    );
    expect(listed).toMatchObject({
      account: 'invited',
      invitation: { email: email('dani') },
    });
    expect(await invitations.revoke(sociaUserId, dani.id)).toEqual({
      status: 'none',
    });
  });

  it('cambia los datos del negocio', async () => {
    const updated = await business.update(sociaUserId, {
      name: 'Socias & Co',
      phone: '+56 9 1234 5678',
    });
    expect(updated).toMatchObject({
      name: 'Socias & Co',
      phone: '+56 9 1234 5678',
    });
  });

  it('su preferencia de avisos es suya, sin tocar la de la dueña', async () => {
    expect((await settings.get(sociaUserId)).newBookings).toBe('ALL');
    await settings.update(sociaUserId, 'OWN');
    expect((await settings.get(sociaUserId)).newBookings).toBe('OWN');
    expect((await settings.get(ownerUserId)).newBookings).toBe('ALL');
    await settings.update(sociaUserId, 'ALL');
  });
});

describe('quitar acceso', () => {
  it('no puede desactivarse a sí misma', async () => {
    await expect(
      members.update(sociaUserId, sociaId, { active: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desactiva y reactiva a un profesional', async () => {
    await members.update(sociaUserId, betoId, { active: false });
    await members.update(sociaUserId, betoId, { active: true });
    const beto = await prisma.member.findUniqueOrThrow({
      where: { id: betoId },
    });
    expect(beto.active).toBe(true);
  });

  // Mismos permisos: también puede desactivar a la dueña que la invitó
  // (pendiente para cuando los permisos sean configurables, en CLAUDE.md)
  it('puede desactivar a la dueña, que pierde el acceso al instante', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });
    await members.update(sociaUserId, ownerId, { active: false });
    await expect(getMembership(db, ownerUserId)).rejects.toThrow();
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    await members.update(sociaUserId, ownerId, { active: true });
    expect((await getMembership(db, ownerUserId)).role).toBe('OWNER');
  });

  it('la dueña le quita el acceso a ella', async () => {
    await members.update(ownerUserId, sociaId, { active: false });
    await expect(getMembership(db, sociaUserId)).rejects.toThrow();
  });
});
