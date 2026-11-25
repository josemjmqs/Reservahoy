import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { AvailabilityService } from '../availability/availability.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { BookingsService } from './bookings.service';

// BookingsService real contra PostgreSQL; el correo y R2 se reemplazan
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const sent: string[] = [];
const notifications = {
  bookingConfirmed: (data: { serviceName: string }) => {
    sent.push(data.serviceName);
    return Promise.resolve();
  },
  newBookingForStaff: () => Promise.resolve(),
} as unknown as NotificationsService;
const storage = { urlFor: () => null } as unknown as StorageService;
const availability = new AvailabilityService(db, storage);
const bookings = new BookingsService(db, availability, notifications);

const run = Date.now().toString(36);
const tz = 'America/Santiago';
const slug = `int-book-${run}`;
// Un lunes de la semana subsiguiente: siempre en el futuro y con horario
const day = DateTime.now().setZone(tz).plus({ weeks: 2 }).startOf('week');
const date = day.toISODate()!;
const at = (time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: tz }).toUTC().toISO()!;

let businessId: string;
let userId: string;
let ana: string; // hace corte y barba
let beto: string; // solo corte
let corte: string; // 30 min
let barba: string; // 20 min
let inactivo: string;
let n = 0;
const customer = () => ({
  name: 'Cliente',
  email: `c${n++}-${run}@test.local`,
});

beforeAll(async () => {
  businessId = (
    await prisma.business.create({ data: { name: 'Barbería', slug } })
  ).id;
  userId = (
    await prisma.user.create({
      data: {
        email: `book-${run}@test.local`,
        name: 'Dueña',
        password: 'x',
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
  const service = (name: string, durationMin: number, active = true) =>
    prisma.service.create({ data: { name, durationMin, active, businessId } });
  corte = (await service('Corte', 30)).id;
  barba = (await service('Barba', 20)).id;
  inactivo = (await service('Viejo', 30, false)).id;

  const member = (displayName: string, serviceIds: string[], owner = false) =>
    prisma.member.create({
      data: {
        role: owner ? 'OWNER' : 'STAFF',
        displayName,
        businessId,
        ...(owner && { userId }),
        services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        hours: { create: { weekday: 1, opensAt: '09:00', closesAt: '18:00' } },
      },
    });
  ana = (await member('Ana', [corte, barba], true)).id;
  beto = (await member('Beto', [corte])).id;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { businessId } }); // borra sus items en cascada
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.workingHours.deleteMany({ where: { member: { businessId } } });
  await prisma.member.deleteMany({ where: { businessId } }); // borra MemberService en cascada
  await prisma.service.deleteMany({ where: { businessId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('reservas con varios servicios', () => {
  it('ofrece horas con espacio para todos los servicios seguidos', async () => {
    const { slots } = await availability.getSlots(slug, [corte, barba], date);
    expect(slots[0]).toBe(at('09:00'));
    // cada 20 min (el servicio más corto) y terminando antes del cierre
    expect(slots[1]).toBe(at('09:20'));
    expect(slots.at(-1)).toBe(at('17:00'));
    expect(slots).not.toContain(at('17:20')); // 17:20 + 50 min pasa de las 18:00
  });

  it('crea un solo bloque, con el profesional que hace todos y los servicios en orden', async () => {
    const r = await bookings.create(slug, {
      serviceIds: [corte, barba],
      startsAt: at('10:00'),
      ...customer(),
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: r.id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    expect(booking.memberId).toBe(ana); // Beto no hace barba
    expect(booking.endsAt.toISOString()).toBe(at('10:50'));
    expect(booking.items.map((i) => i.serviceId)).toEqual([corte, barba]);
    expect(sent.at(-1)).toBe('Corte + Barba');
  });

  it('el bloque ocupa la agenda completa: las 10:30 ya no están libres para Ana', async () => {
    const { slots } = await availability.getSlots(slug, [barba], date);
    expect(slots).not.toContain(at('10:20'));
    expect(slots).not.toContain(at('10:40'));
    expect(slots).toContain(at('11:00'));
  });

  it('rechaza un profesional que no hace todos los servicios', async () => {
    await expect(
      bookings.create(slug, {
        serviceIds: [corte, barba],
        memberId: beto,
        startsAt: at('12:00'),
        ...customer(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('un servicio repetido cuenta una sola vez', async () => {
    const r = await bookings.create(slug, {
      serviceIds: [corte, corte],
      memberId: beto,
      startsAt: at('12:00'),
      ...customer(),
    });
    expect(new Date(r.endsAt).toISOString()).toBe(at('12:30'));
  });

  it('valida la lista de servicios', async () => {
    await expect(
      bookings.create(slug, {
        serviceIds: [],
        startsAt: at('13:00'),
        ...customer(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      bookings.create(slug, {
        serviceIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        startsAt: at('13:00'),
        ...customer(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      bookings.create(slug, {
        serviceIds: [corte, inactivo],
        startsAt: at('13:00'),
        ...customer(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sigue aceptando un solo serviceId (frontend anterior)', async () => {
    const r = await bookings.create(slug, {
      serviceId: corte,
      memberId: beto,
      startsAt: at('14:00'),
      ...customer(),
    });
    expect(new Date(r.endsAt).toISOString()).toBe(at('14:30'));
  });
});

describe('dos clientes por la misma hora', () => {
  // Disponibilidad que deja pasar la hora y justo después otra reserva la
  // toma: la carrera que solo frena booking_no_overlap al guardar
  const taken: string[] = [];
  class RacingAvailability extends AvailabilityService {
    override async slotsForMember(
      ...args: Parameters<AvailabilityService['slotsForMember']>
    ) {
      const slots = await super.slotsForMember(...args);
      const customerId = (
        await prisma.customer.create({
          data: {
            businessId,
            name: 'Rápido',
            email: `rapido-${run}@test.local`,
          },
        })
      ).id;
      const b = await prisma.booking.create({
        data: {
          startsAt: new Date(at('15:00')),
          endsAt: new Date(at('15:30')),
          businessId,
          memberId: args[0],
          customerId,
          items: { create: { serviceId: corte, position: 0 } },
        },
      });
      taken.push(b.id);
      return slots;
    }
  }

  it('si otra reserva toma la hora al guardar, responde 409 y no deja nada a medias', async () => {
    const racing = new BookingsService(
      db,
      new RacingAvailability(db, storage),
      notifications,
    );
    const email = `perdio-${run}@test.local`;
    const attempt = racing.create(slug, {
      serviceIds: [corte],
      memberId: beto,
      startsAt: at('15:00'),
      name: 'Cliente',
      email,
    });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow('Esa hora ya fue tomada');

    const at15 = await prisma.booking.findMany({
      where: { memberId: beto, startsAt: new Date(at('15:00')) },
    });
    expect(at15.map((b) => b.id)).toEqual(taken);
    // El cliente se crea en la misma transacción: tampoco queda
    expect(await prisma.customer.count({ where: { businessId, email } })).toBe(
      0,
    );
  });

  // Seis transacciones que chocan en la misma fila: en CI, con otras suites
  // usando la misma base, a veces pasan de los 5 s por defecto de Jest
  it('con varias reservas a la vez, una gana y las demás reciben 409', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        bookings.create(slug, {
          serviceIds: [corte],
          memberId: beto,
          startsAt: at('15:30'),
          ...customer(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ConflictException);
      }
    }
    expect(
      await prisma.booking.count({
        where: { memberId: beto, startsAt: new Date(at('15:30')) },
      }),
    ).toBe(1);
  }, 20_000);

  it('un deadlock de PostgreSQL también cuenta como hora tomada; otro error no', () => {
    const isOverlap = (e: unknown) => bookings['isOverlap'](e);
    const meta = { clientVersion: Prisma.prismaVersion.client };
    // Cada caso trae una sola señal, para que quitar cualquiera se note:
    // como lo informa Prisma (P2034, con la palabra) y como lo informa
    // PostgreSQL (solo el código)
    expect(
      isOverlap(
        new Prisma.PrismaClientKnownRequestError(
          'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
          { ...meta, code: 'P2034' },
        ),
      ),
    ).toBe(true);
    expect(
      isOverlap(
        new Prisma.PrismaClientUnknownRequestError(
          'db error: ERROR: code 40P01',
          meta,
        ),
      ),
    ).toBe(true);
    expect(
      isOverlap(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          ...meta,
          code: 'P2002',
        }),
      ),
    ).toBe(false);
    expect(isOverlap(new Error('booking_no_overlap'))).toBe(false);
  });
});

describe('máximo de reservas por correo', () => {
  const email = `repetido-${run}@test.local`;
  const book = (time: string, mail = email) =>
    bookings.create(slug, {
      serviceIds: [corte],
      memberId: ana,
      startsAt: at(time),
      name: 'Cliente',
      email: mail,
    });

  it('la cuarta reserva en una hora con el mismo correo responde 429 y no se guarda', async () => {
    await book('16:00');
    await book('16:30');
    await book('17:00');

    const fourth = book('17:30');
    await expect(fourth).rejects.toBeInstanceOf(HttpException);
    await expect(fourth).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(
      await prisma.booking.count({
        where: { businessId, customer: { email } },
      }),
    ).toBe(3);
  });

  it('otro correo sigue reservando', async () => {
    await expect(
      book('17:30', `otro-${run}@test.local`),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('las reservas de hace más de una hora no cuentan', async () => {
    await prisma.booking.updateMany({
      where: { businessId, customer: { email } },
      data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) },
    });
    await expect(book('11:00')).resolves.toMatchObject({ status: 'CONFIRMED' });
  });
});
