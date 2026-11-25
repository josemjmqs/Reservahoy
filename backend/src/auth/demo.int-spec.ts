import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { AvailabilityService } from '../availability/availability.service';
import { BookingsService } from '../bookings/bookings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';

// Negocio de demostración (Business.demo): sus cuentas entran sin contraseña
// con demoLogin, la sesión sale marcada como demo (JwtAuthGuard solo la deja
// leer), no reciben correos de contraseña y su página pública no guarda reservas
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const jwt = new JwtService({ secret: 'test-secret' });
const resets: string[] = [];
const notifications = {
  passwordReset: (to: string) => {
    resets.push(to);
    return Promise.resolve();
  },
  bookingConfirmed: () => Promise.resolve(),
  newBookingForStaff: () => Promise.resolve(),
} as unknown as NotificationsService;
const auth = new AuthService(db, jwt, notifications);
const storage = { urlFor: () => null } as unknown as StorageService;
const availability = new AvailabilityService(db, storage);
const bookings = new BookingsService(db, availability, notifications);

const run = Date.now().toString(36);
const demoSlug = `int-demo-${run}`;
const realSlug = `int-real-${run}`;
const ownerEmail = `demo-owner-${run}@test.local`;
const staffEmail = `demo-staff-${run}@test.local`;
const realEmail = `real-${run}@test.local`;
const ids: Record<string, string> = {};

async function business(slug: string, demo: boolean) {
  return prisma.business.create({ data: { name: slug, slug, demo } });
}
async function memberWithUser(
  businessId: string,
  email: string,
  role: 'OWNER' | 'STAFF',
) {
  const user = await prisma.user.create({
    data: { email, name: email, password: 'x', emailVerifiedAt: new Date() },
  });
  const member = await prisma.member.create({
    data: { role, displayName: role, userId: user.id, businessId },
  });
  return { user, member };
}

beforeAll(async () => {
  const demo = await business(demoSlug, true);
  const real = await business(realSlug, false);
  ids.demo = demo.id;
  ids.real = real.id;
  const owner = await memberWithUser(demo.id, ownerEmail, 'OWNER');
  ids.ownerUser = owner.user.id;
  ids.owner = owner.member.id;
  ids.staffUser = (await memberWithUser(demo.id, staffEmail, 'STAFF')).user.id;
  ids.realUser = (await memberWithUser(real.id, realEmail, 'OWNER')).user.id;
  const service = await prisma.service.create({
    data: {
      name: 'Corte',
      durationMin: 30,
      businessId: demo.id,
      members: { create: [{ memberId: owner.member.id }] },
    },
  });
  ids.service = service.id;
  await prisma.workingHours.create({
    data: { memberId: owner.member.id, weekday: 1, opensAt: '09:00', closesAt: '18:00' },
  });
});

afterAll(async () => {
  const businessIds = [ids.demo, ids.real];
  await prisma.service.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.workingHours.deleteMany({ where: { member: { businessId: { in: businessIds } } } });
  await prisma.member.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.ownerUser, ids.staffUser, ids.realUser] } },
  });
  await prisma.$disconnect();
});

const session = (userId: string) =>
  auth.validateSession({ sub: userId, email: 'x', sv: 0, iat: 0 });

describe('sesión de la demo', () => {
  it('la sesión de una cuenta demo sale marcada como demo', async () => {
    expect(await session(ids.ownerUser)).toMatchObject({ demo: true });
    expect(await session(ids.staffUser)).toMatchObject({ demo: true });
  });

  it('una cuenta de un negocio real no', async () => {
    expect(await session(ids.realUser)).toMatchObject({ demo: false });
  });

  it('/auth/me dice si el negocio es la demo', async () => {
    const me = await auth.me(ids.ownerUser);
    expect(me.membership.business.demo).toBe(true);
    expect((await auth.me(ids.realUser)).membership.business.demo).toBe(false);
  });
});

describe('demoLogin', () => {
  // Puede haber otra demo en la base (la del seed): se revisa que la sesión
  // sea de una cuenta demo con el rol pedido, no cuál
  it.each([
    ['owner', 'OWNER'],
    ['staff', 'STAFF'],
  ] as const)('entra como %s de un negocio demo', async (role, dbRole) => {
    const { accessToken } = await auth.demoLogin(role);
    const { sub } = jwt.verify<{ sub: string }>(accessToken);
    const member = await prisma.member.findFirstOrThrow({
      where: { userId: sub },
      include: { business: true },
    });
    expect(member.role).toBe(dbRole);
    expect(member.business.demo).toBe(true);
  });
});

describe('lo que la demo no hace', () => {
  it('no manda correos para restablecer la contraseña', async () => {
    await auth.forgotPassword(ownerEmail);
    await auth.forgotPassword(realEmail);
    expect(resets).toEqual([realEmail]);
  });

  it('su página pública no guarda reservas', async () => {
    const monday = DateTime.now().setZone('America/Santiago').plus({ weeks: 2 }).startOf('week');
    const create = bookings.create(demoSlug, {
      serviceIds: [ids.service],
      startsAt: monday.set({ hour: 10 }).toUTC().toISO()!,
      name: 'Visita',
      email: `visita-${run}@test.local`,
    });
    await expect(create).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.booking.count({ where: { businessId: ids.demo } })).toBe(0);
  });
});
