import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { BookingsService } from '../bookings/bookings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { AvailabilityService } from './availability.service';

// Horario con almuerzo contra PostgreSQL: esa franja no se ofrece ni se puede
// reservar, tampoco con una reserva de varios servicios (un solo bloque)
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const notifications = {
  bookingConfirmed: () => Promise.resolve(),
  newBookingForStaff: () => Promise.resolve(),
} as unknown as NotificationsService;
const storage = { urlFor: () => null } as unknown as StorageService;
const availability = new AvailabilityService(db, storage);
const bookings = new BookingsService(db, availability, notifications);

const run = Date.now().toString(36);
const tz = 'America/Santiago';
const slug = `int-lunch-${run}`;
// Un lunes de la semana subsiguiente: siempre en el futuro y con horario
const day = DateTime.now().setZone(tz).plus({ weeks: 2 }).startOf('week');
const date = day.toISODate()!;
const at = (time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: tz }).toUTC().toISO()!;

let businessId: string;
let userId: string;
let corte: string; // 30 min
let barba: string; // 20 min
let n = 0;
const customer = () => ({
  name: 'Cliente',
  email: `c${n++}-${run}@test.local`,
});

beforeAll(async () => {
  businessId = (
    await prisma.business.create({ data: { name: 'Almuerzo', slug } })
  ).id;
  userId = (
    await prisma.user.create({
      data: {
        email: `lunch-${run}@test.local`,
        name: 'Dueña',
        password: 'x',
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
  const service = (name: string, durationMin: number) =>
    prisma.service.create({ data: { name, durationMin, businessId } });
  corte = (await service('Corte', 30)).id;
  barba = (await service('Barba', 20)).id;

  await prisma.member.create({
    data: {
      role: 'OWNER',
      displayName: 'Ana',
      businessId,
      userId,
      services: { create: [{ serviceId: corte }, { serviceId: barba }] },
      // Lunes 09:00–18:00 con almuerzo de 13:00 a 14:00; martes sin almuerzo
      hours: {
        create: [
          {
            weekday: 1,
            opensAt: '09:00',
            closesAt: '18:00',
            breakStartsAt: '13:00',
            breakEndsAt: '14:00',
          },
          { weekday: 2, opensAt: '09:00', closesAt: '18:00' },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.workingHours.deleteMany({ where: { member: { businessId } } });
  await prisma.member.deleteMany({ where: { businessId } });
  await prisma.service.deleteMany({ where: { businessId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('disponibilidad con almuerzo', () => {
  it('no ofrece horas durante el almuerzo y retoma justo al terminar', async () => {
    const { slots } = await availability.getSlots(slug, [corte], date);
    expect(slots).toContain(at('12:30')); // termina 13:00, justo al empezar
    expect(slots).not.toContain(at('13:00'));
    expect(slots).not.toContain(at('13:30'));
    expect(slots).toContain(at('14:00'));
    expect(slots.at(-1)).toBe(at('17:30'));
  });

  it('una reserva de varios servicios es un solo bloque y no cruza el almuerzo', async () => {
    // corte + barba = 50 min, cada 20 min (el servicio más corto)
    const { slots } = await availability.getSlots(slug, [corte, barba], date);
    expect(slots).toContain(at('12:00')); // 12:00–12:50
    expect(slots).not.toContain(at('12:20')); // 12:20–13:10 cruza
    expect(slots).not.toContain(at('12:40'));
    expect(slots).not.toContain(at('13:40'));
    // La tarde arma su grilla desde el término del almuerzo
    expect(slots).toContain(at('14:00'));
    expect(slots).toContain(at('14:20'));
  });

  it('rechaza reservar una hora que cruza el almuerzo', async () => {
    await expect(
      bookings.create(slug, {
        serviceIds: [corte, barba],
        startsAt: at('12:20'),
        ...customer(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      bookings.create(slug, {
        serviceIds: [corte],
        startsAt: at('13:30'),
        ...customer(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('acepta la primera hora después del almuerzo', async () => {
    const r = await bookings.create(slug, {
      serviceIds: [corte],
      startsAt: at('14:00'),
      ...customer(),
    });
    expect(r.startsAt.toISOString()).toBe(at('14:00'));
  });

  it('un día sin almuerzo ofrece el horario completo', async () => {
    const tuesday = day.plus({ days: 1 });
    const t = (time: string) =>
      DateTime.fromISO(`${tuesday.toISODate()}T${time}`, { zone: tz })
        .toUTC()
        .toISO()!;
    const { slots } = await availability.getSlots(
      slug,
      [corte],
      tuesday.toISODate()!,
    );
    expect(slots).toContain(t('13:00'));
    expect(slots).toContain(t('13:30'));
  });
});
