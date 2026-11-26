import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { AvailabilityService } from './availability.service';

// La página pública del negocio (GET /public/:slug) la puede ver cualquiera:
// solo debe mostrar lo necesario para reservar
const prisma = new PrismaClient();
const storage = {
  urlFor: (key: string | null) => (key ? `https://img.test/${key}` : null),
} as unknown as StorageService;
const availability = new AvailabilityService(
  prisma as unknown as PrismaService,
  storage,
);
const run = Date.now().toString(36);
const slug = `int-public-${run}`;

let businessId: string;
let userId: string;
let staffUserId: string | undefined;

beforeAll(async () => {
  businessId = (
    await prisma.business.create({
      data: {
        name: 'Barbería Pública',
        slug,
        phone: '+56 9 1234 5678',
        address: 'Av. Irarrázaval 742, Ñuñoa',
        brandColor: '#0f766e',
        logoKey: `logos/${run}.png`,
      },
    })
  ).id;
  userId = (
    await prisma.user.create({
      data: {
        email: `public-${run}@test.local`,
        name: 'D',
        password: 'secreto',
      },
    })
  ).id;
  const corte = await prisma.service.create({
    data: {
      name: 'Corte',
      durationMin: 30,
      price: 10000,
      imageKey: `services/${run}.webp`,
      businessId,
    },
  });
  await prisma.service.create({
    data: { name: 'Antiguo', durationMin: 30, active: false, businessId },
  });
  await prisma.member.create({
    data: {
      role: 'OWNER',
      displayName: 'Dueña',
      userId,
      businessId,
      services: { create: { serviceId: corte.id } },
    },
  });
  await prisma.member.createMany({
    data: [
      { role: 'STAFF', displayName: 'Inactivo', active: false, businessId },
      { role: 'STAFF', displayName: 'Recepción', bookable: false, businessId },
    ],
  });
});

afterAll(async () => {
  await prisma.workingHours.deleteMany({ where: { member: { businessId } } });
  await prisma.timeBlock.deleteMany({ where: { businessId } });
  await prisma.memberService.deleteMany({ where: { member: { businessId } } });
  await prisma.member.deleteMany({ where: { businessId } });
  await prisma.service.deleteMany({ where: { businessId } });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, staffUserId].filter((x) => x !== undefined) } },
  });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('AvailabilityService.getBusiness (página pública)', () => {
  it('muestra solo servicios activos, con la URL pública de la foto', async () => {
    const page = await availability.getBusiness(slug);
    expect(page.services.map((s) => s.name)).toEqual(['Corte']);
    expect(page.services[0].imageUrl).toBe(
      `https://img.test/services/${run}.webp`,
    );
    expect(page.services[0]).not.toHaveProperty('imageKey');
  });

  it('muestra el color de marca y la URL pública del logo, nunca su ruta', async () => {
    const page = await availability.getBusiness(slug);
    expect(page.brandColor).toBe('#0f766e');
    expect(page.logoUrl).toBe(`https://img.test/logos/${run}.png`);
    expect(page).not.toHaveProperty('logoKey');
  });

  it('muestra solo profesionales activos que atienden', async () => {
    const page = await availability.getBusiness(slug);
    expect(page.members.map((m) => m.displayName)).toEqual(['Dueña']);
  });

  it('no expone datos internos del negocio, del equipo ni de las cuentas', async () => {
    const page = await availability.getBusiness(slug);
    expect(Object.keys(page).sort()).toEqual(
      [
        'acceptsBookings',
        'address',
        'brandColor',
        'closedDays',
        'demo',
        'logoUrl',
        'members',
        'name',
        'phone',
        'services',
        'slug',
        'timezone',
        'todayHours',
      ].sort(),
    );
    expect(Object.keys(page.members[0]).sort()).toEqual(
      ['displayName', 'id', 'services'].sort(),
    );
    const text = JSON.stringify(page);
    expect(text).not.toContain(`public-${run}@test.local`);
    expect(text).not.toContain(userId);
    expect(text).not.toContain(businessId);
  });

  // Con invitaciones, un profesional puede tener su correo verificado antes que
  // el dueño: eso no basta para que el negocio reciba reservas
  it('un profesional con correo verificado no habilita las reservas', async () => {
    staffUserId = (
      await prisma.user.create({
        data: {
          email: `public-staff-${run}@test.local`,
          name: 'P',
          password: 'secreto',
          emailVerifiedAt: new Date(),
        },
      })
    ).id;
    await prisma.member.create({
      data: {
        role: 'STAFF',
        displayName: 'Profesional',
        userId: staffUserId,
        businessId,
      },
    });
    expect((await availability.getBusiness(slug)).acceptsBookings).toBe(false);
    expect(await availability.acceptsBookings({ id: businessId })).toBe(false);
  });

  it('indica si el negocio recibe reservas según la verificación del dueño', async () => {
    expect((await availability.getBusiness(slug)).acceptsBookings).toBe(false);
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    expect((await availability.getBusiness(slug)).acceptsBookings).toBe(true);
  });

  it('un dueño desactivado no habilita las reservas', async () => {
    await prisma.member.updateMany({
      where: { businessId, userId },
      data: { active: false },
    });
    try {
      expect(await availability.acceptsBookings({ id: businessId })).toBe(
        false,
      );
    } finally {
      await prisma.member.updateMany({
        where: { businessId, userId },
        data: { active: true },
      });
    }
  });

  // "Hoy atiende de ... a ...": el miércoles 18 de noviembre de 2026, a las
  // 8:00 en Santiago (antes de abrir: el horario es de todo el día)
  describe('todayHours', () => {
    const tz = 'America/Santiago';
    const now = DateTime.fromISO('2026-11-18T08:00', { zone: tz });
    const at = (hhmm: string) =>
      DateTime.fromISO(`2026-11-18T${hhmm}`, { zone: tz }).toJSDate();
    let morning: string;
    let afternoon: string;

    beforeAll(async () => {
      [morning, afternoon] = await Promise.all(
        ['Mañana', 'Tarde'].map(
          async (displayName) =>
            (
              await prisma.member.create({
                data: { role: 'STAFF', displayName, businessId },
              })
            ).id,
        ),
      );
      // Miércoles = 3; la tarde también trabaja el jueves (no cuenta hoy)
      await prisma.workingHours.createMany({
        data: [
          { memberId: morning, weekday: 3, opensAt: '09:00', closesAt: '14:00' },
          {
            memberId: afternoon,
            weekday: 3,
            opensAt: '12:00',
            closesAt: '20:30',
            breakStartsAt: '15:00',
            breakEndsAt: '16:00',
          },
          { memberId: afternoon, weekday: 4, opensAt: '07:00', closesAt: '22:00' },
        ],
      });
    });

    afterEach(() => prisma.timeBlock.deleteMany({ where: { businessId } }));

    const hoursFor = (ids: string[]) =>
      availability.todayHours({ slug, timezone: tz }, ids, now);

    it('va de la primera apertura al último cierre de quienes atienden hoy', async () => {
      expect(await hoursFor([morning, afternoon])).toEqual({
        opensAt: '09:00',
        closesAt: '20:30',
      });
    });

    it('no cuenta a quien tiene un bloqueo que cubre todo su horario', async () => {
      await prisma.timeBlock.create({
        data: { businessId, memberId: morning, startsAt: at('00:00'), endsAt: at('23:59') },
      });
      expect(await hoursFor([morning, afternoon])).toEqual({
        opensAt: '12:00',
        closesAt: '20:30',
      });
    });

    it('un bloqueo de parte del día no cambia el horario', async () => {
      await prisma.timeBlock.create({
        data: { businessId, memberId: null, startsAt: at('10:00'), endsAt: at('11:00') },
      });
      expect(await hoursFor([morning, afternoon])).toEqual({
        opensAt: '09:00',
        closesAt: '20:30',
      });
    });

    it('con un bloqueo de todo el negocio, hoy no atiende', async () => {
      await prisma.timeBlock.create({
        data: { businessId, memberId: null, startsAt: at('00:00'), endsAt: at('23:59') },
      });
      expect(await hoursFor([morning, afternoon])).toBeNull();
    });

    it('sin horario para hoy, o sin profesionales, es null', async () => {
      expect(await hoursFor([])).toBeNull();
      const other = (
        await prisma.member.create({
          data: { role: 'STAFF', displayName: 'Sin horario', businessId },
        })
      ).id;
      expect(await hoursFor([other])).toBeNull();
    });

    // La grilla de días marca como cerrados los días sin horario
    const closedFor = async (ids: string[]) =>
      (await availability.dailyHours({ slug, timezone: tz }, ids, 7, now))
        .filter((d) => !d.hours)
        .map((d) => d.date);

    it('dailyHours: cerrado los días en que nadie trabaja', async () => {
      const week = await availability.dailyHours(
        { slug, timezone: tz },
        [morning, afternoon],
        7,
        now,
      );
      expect(week.slice(0, 2)).toEqual([
        { date: '2026-11-18', hours: { opensAt: '09:00', closesAt: '20:30' } },
        { date: '2026-11-19', hours: { opensAt: '07:00', closesAt: '22:00' } },
      ]);
      expect(await closedFor([morning, afternoon])).toEqual([
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
      ]);
    });

    it('dailyHours: un bloqueo de todo el negocio que cubre el día lo cierra', async () => {
      await prisma.timeBlock.create({
        data: {
          businessId,
          memberId: null,
          startsAt: DateTime.fromISO('2026-11-19T00:00', { zone: tz }).toJSDate(),
          endsAt: DateTime.fromISO('2026-11-20T00:00', { zone: tz }).toJSDate(),
        },
      });
      expect(await closedFor([morning, afternoon])).toEqual([
        '2026-11-19',
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
      ]);
    });

    it('dailyHours: sin profesionales, todos los días cerrados', async () => {
      expect(await closedFor([])).toHaveLength(7);
    });
  });

  it('un slug que no existe responde 404', async () => {
    await expect(availability.getBusiness(`no-${run}`)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
