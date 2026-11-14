import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { assertOwner, getMembership } from './membership';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const run = Date.now().toString(36);

const keys = ['owner', 'staff', 'inactive', 'lone', 'moved'] as const;
const userIds = {} as Record<(typeof keys)[number], string>;
let businessId: string;
let otherBusinessId: string;

beforeAll(async () => {
  [businessId, otherBusinessId] = (
    await Promise.all(
      ['a', 'b'].map((x) =>
        prisma.business.create({
          data: {
            name: `Membresía ${x}`,
            slug: `int-membership-${x}-${run}`,
            timezone: x === 'a' ? 'America/Santiago' : 'America/Lima',
          },
        }),
      ),
    )
  ).map((b) => b.id);
  for (const key of keys) {
    userIds[key] = (
      await prisma.user.create({
        data: {
          email: `membership-${key}-${run}@test.local`,
          name: key,
          password: 'x',
        },
      })
    ).id;
  }
  // createMany no garantiza el orden de los id: se crean uno por uno para que
  // la membresía desactivada de "moved" tenga el id menor
  for (const data of [
    { role: 'OWNER', userId: userIds.owner, businessId },
    { role: 'STAFF', userId: userIds.staff, businessId },
    { role: 'STAFF', userId: userIds.inactive, businessId, active: false },
    { role: 'STAFF', userId: userIds.moved, businessId, active: false },
    { role: 'STAFF', userId: userIds.moved, businessId: otherBusinessId },
  ] as const) {
    await prisma.member.create({ data: { ...data, displayName: 'M' } });
  }
});

afterAll(async () => {
  const businesses = [businessId, otherBusinessId];
  await prisma.member.deleteMany({ where: { businessId: { in: businesses } } });
  await prisma.user.deleteMany({
    where: { id: { in: Object.values(userIds) } },
  });
  await prisma.business.deleteMany({ where: { id: { in: businesses } } });
  await prisma.$disconnect();
});

describe('getMembership', () => {
  it('devuelve el negocio, el rol y la zona horaria del usuario', async () => {
    const m = await getMembership(db, userIds.owner);
    expect(m).toEqual({
      memberId: expect.any(String),
      businessId,
      role: 'OWNER',
      timezone: 'America/Santiago',
    });
  });

  it('un usuario sin negocio no tiene membresía', async () => {
    await expect(getMembership(db, userIds.lone)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('una membresía desactivada no da acceso', async () => {
    await expect(getMembership(db, userIds.inactive)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ignora la membresía desactivada y toma la activa', async () => {
    const m = await getMembership(db, userIds.moved);
    expect(m.businessId).toBe(otherBusinessId);
    expect(m.timezone).toBe('America/Lima');
  });
});

describe('assertOwner', () => {
  it('deja pasar al dueño', async () => {
    const m = await getMembership(db, userIds.owner);
    expect(() => assertOwner(m)).not.toThrow();
  });

  it('bloquea al profesional, con el mensaje indicado', async () => {
    const m = await getMembership(db, userIds.staff);
    expect(() => assertOwner(m)).toThrow('Solo el dueño puede hacer esto');
    expect(() => assertOwner(m, 'Otro mensaje')).toThrow('Otro mensaje');
  });
});
