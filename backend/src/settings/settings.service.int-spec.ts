import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

const prisma = new PrismaClient();
const service = new SettingsService(prisma as unknown as PrismaService);
const run = Date.now().toString(36);

let businessId: string;
let userId: string;
let loneUserId: string;

beforeAll(async () => {
  businessId = (
    await prisma.business.create({
      data: { name: 'Ajustes', slug: `int-settings-${run}` },
    })
  ).id;
  userId = (
    await prisma.user.create({
      data: { email: `settings-${run}@test.local`, name: 'D', password: 'x' },
    })
  ).id;
  loneUserId = (
    await prisma.user.create({
      data: {
        email: `settings-lone-${run}@test.local`,
        name: 'L',
        password: 'x',
      },
    })
  ).id;
  await prisma.member.create({
    data: { role: 'OWNER', displayName: 'D', userId, businessId },
  });
});

afterAll(async () => {
  await prisma.member.deleteMany({ where: { businessId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, loneUserId] } } });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('SettingsService', () => {
  // El registro y aceptar una invitación dejan al dueño en ALL; un miembro
  // creado sin elegir parte limitado, como un rol nuevo
  it('un miembro nuevo parte recibiendo solo las reservas que atiende', async () => {
    expect(await service.get(userId)).toEqual({
      newBookings: 'OWN',
      email: `settings-${run}@test.local`,
    });
  });

  it('el dueño elige entre todas, las suyas o ninguna', async () => {
    for (const scope of ['ALL', 'NONE', 'OWN'] as const) {
      expect(await service.update(userId, scope)).toMatchObject({
        newBookings: scope,
      });
      expect((await service.get(userId)).newBookings).toBe(scope);
    }
  });

  it('un usuario sin negocio no tiene ajustes', async () => {
    await expect(service.get(loneUserId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
