import { ForbiddenException, HttpException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_MAX_PER_HOUR, SupportService } from './support.service';

const prisma = new PrismaClient();
const sent: { kind: string; userEmail: string; role: string }[] = [];
const notifications = {
  supportRequest: (d: { kind: string; userEmail: string; role: string }) => {
    sent.push(d);
    return Promise.resolve();
  },
} as unknown as NotificationsService;
const service = new SupportService(
  prisma as unknown as PrismaService,
  notifications,
);
const run = Date.now().toString(36);

let businessId: string;
let ownerId: string;
let staffId: string;
let staffMemberId: string;
let revokedId: string;
const userIds: string[] = [];

const user = async (tag: string) => {
  const id = (
    await prisma.user.create({
      data: {
        email: `support-${tag}-${run}@test.local`,
        name: tag,
        password: 'x',
      },
    })
  ).id;
  userIds.push(id);
  return id;
};

beforeAll(async () => {
  businessId = (
    await prisma.business.create({
      data: { name: 'Soporte', slug: `int-support-${run}` },
    })
  ).id;
  ownerId = await user('owner');
  staffId = await user('staff');
  revokedId = await user('revoked');
  await prisma.member.create({
    data: { role: 'OWNER', displayName: 'Dueña', userId: ownerId, businessId },
  });
  staffMemberId = (
    await prisma.member.create({
      data: { role: 'STAFF', displayName: 'Pro', userId: staffId, businessId },
    })
  ).id;
  await prisma.member.create({
    data: {
      role: 'STAFF',
      displayName: 'Ex',
      userId: revokedId,
      businessId,
      active: false,
    },
  });
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  await prisma.supportRequest.deleteMany({ where: { businessId } });
  await prisma.member.deleteMany({ where: { businessId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('SupportService', () => {
  it('guarda el mensaje con su negocio y miembro, y avisa por correo', async () => {
    const r = await service.create(ownerId, {
      kind: 'PROBLEM',
      message: 'No carga la agenda',
      page: '/dashboard/agenda',
      userAgent: 'Mozilla/5.0',
    });
    const saved = await prisma.supportRequest.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(saved).toMatchObject({
      kind: 'PROBLEM',
      message: 'No carga la agenda',
      page: '/dashboard/agenda',
      userAgent: 'Mozilla/5.0',
      businessId,
    });
    expect(sent).toEqual([
      expect.objectContaining({
        kind: 'PROBLEM',
        userEmail: `support-owner-${run}@test.local`,
        role: 'OWNER',
      }),
    ]);
  });

  it('un profesional también puede escribir', async () => {
    const r = await service.create(staffId, {
      kind: 'QUESTION',
      message: '¿Cómo cambio mi horario?',
    });
    const saved = await prisma.supportRequest.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(saved).toMatchObject({
      memberId: staffMemberId,
      businessId,
      page: null,
      userAgent: null,
    });
    expect(sent[0]).toMatchObject({ role: 'STAFF' });
  });

  it('recorta un navegador demasiado largo', async () => {
    const r = await service.create(ownerId, {
      kind: 'SUGGESTION',
      message: 'Sería bueno tener recordatorios',
      userAgent: 'x'.repeat(1000),
    });
    const saved = await prisma.supportRequest.findUniqueOrThrow({
      where: { id: r.id },
    });
    expect(saved.userAgent).toHaveLength(300);
  });

  it(`como mucho ${SUPPORT_MAX_PER_HOUR} mensajes por hora por miembro`, async () => {
    const already = await prisma.supportRequest.count({
      where: { memberId: staffMemberId },
    });
    for (let i = already; i < SUPPORT_MAX_PER_HOUR; i++) {
      await service.create(staffId, { kind: 'QUESTION', message: `Duda ${i}` });
    }
    const err = await service
      .create(staffId, { kind: 'QUESTION', message: 'Una más' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    // El límite es por miembro: la dueña sigue pudiendo escribir
    await expect(
      service.create(ownerId, { kind: 'QUESTION', message: 'Otra duda' }),
    ).resolves.toHaveProperty('id');
  });

  it('sin membresía activa no se puede escribir', async () => {
    await expect(
      service.create(revokedId, {
        kind: 'PROBLEM',
        message: 'No puedo entrar',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
