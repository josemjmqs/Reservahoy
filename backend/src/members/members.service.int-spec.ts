import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { MembersService } from './members.service';

// Equipo del negocio contra PostgreSQL
const prisma = new PrismaClient();
const members = new MembersService(prisma as unknown as PrismaService);
const run = Date.now().toString(36);

let businessId: string;
let otherBusinessId: string;
let ownerUserId: string;
let ownerMemberId: string;
let corte: string;
let barba: string;
let ajeno: string;

beforeAll(async () => {
  const [b1, b2] = await Promise.all(
    ['a', 'b'].map((x) =>
      prisma.business.create({
        data: { name: `Equipo ${x}`, slug: `int-members-${x}-${run}` },
      }),
    ),
  );
  businessId = b1.id;
  otherBusinessId = b2.id;
  ownerUserId = (
    await prisma.user.create({
      data: { email: `members-${run}@test.local`, name: 'D', password: 'x' },
    })
  ).id;
  ownerMemberId = (
    await prisma.member.create({
      data: {
        role: 'OWNER',
        displayName: 'Dueña',
        userId: ownerUserId,
        businessId,
      },
    })
  ).id;
  const service = (name: string, bId = businessId) =>
    prisma.service.create({ data: { name, durationMin: 30, businessId: bId } });
  [corte, barba, ajeno] = (
    await Promise.all([
      service('Corte'),
      service('Barba'),
      service('De otro', otherBusinessId),
    ])
  ).map((s) => s.id);
});

afterAll(async () => {
  const ids = [businessId, otherBusinessId];
  await prisma.member.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.service.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: `members-staff-${run}` } },
  });
  await prisma.user.delete({ where: { id: ownerUserId } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const servicesOf = async (memberId: string) =>
  (await members.list(ownerUserId))
    .find((m) => m.id === memberId)!
    .services.map((s) => s.serviceId)
    .sort();

describe('MembersService', () => {
  it('crea un profesional como STAFF con los servicios que realiza', async () => {
    const { id } = await members.create(ownerUserId, {
      displayName: 'Beto',
      serviceIds: [corte, barba],
    });
    const created = (await members.list(ownerUserId)).find((m) => m.id === id)!;
    expect(created).toMatchObject({
      role: 'STAFF',
      active: true,
      bookable: true,
    });
    expect(await servicesOf(id)).toEqual([corte, barba].sort());
  });

  it('no acepta servicios de otro negocio ni inexistentes', async () => {
    await expect(
      members.create(ownerUserId, { displayName: 'X', serviceIds: [ajeno] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      members.create(ownerUserId, {
        displayName: 'X',
        serviceIds: ['no-existe'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('al editar, los servicios se reemplazan (no se suman)', async () => {
    const { id } = await members.create(ownerUserId, {
      displayName: 'Caro',
      serviceIds: [corte, barba],
    });
    await members.update(ownerUserId, id, { serviceIds: [barba] });
    expect(await servicesOf(id)).toEqual([barba]);
  });

  it('editar solo el nombre no le quita los servicios', async () => {
    const { id } = await members.create(ownerUserId, {
      displayName: 'Dani',
      serviceIds: [corte],
    });
    await members.update(ownerUserId, id, { displayName: 'Daniela' });
    expect(await servicesOf(id)).toEqual([corte]);
  });

  it('un servicio inválido al editar no deja cambios a medias', async () => {
    const { id } = await members.create(ownerUserId, {
      displayName: 'Eli',
      serviceIds: [corte],
    });
    await expect(
      members.update(ownerUserId, id, {
        displayName: 'Otro',
        serviceIds: [ajeno],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const eli = (await members.list(ownerUserId)).find((m) => m.id === id)!;
    expect(eli.displayName).toBe('Eli');
    expect(await servicesOf(id)).toEqual([corte]);
  });

  it('se puede desactivar a un profesional, pero no a uno mismo', async () => {
    const { id } = await members.create(ownerUserId, { displayName: 'Fer' });
    expect(
      (await members.update(ownerUserId, id, { active: false })).active,
    ).toBe(false);
    await expect(
      members.update(ownerUserId, ownerMemberId, { active: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desactivar a alguien con cuenta cierra sus sesiones, una sola vez', async () => {
    const user = await prisma.user.create({
      data: { email: `members-staff-${run}@test.local`, name: 'G', password: 'x' },
    });
    const { id } = await members.create(ownerUserId, { displayName: 'Gabi' });
    await prisma.member.update({ where: { id }, data: { userId: user.id } });
    const version = async () =>
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .sessionVersion;

    await members.update(ownerUserId, id, { active: false });
    expect(await version()).toBe(1);
    // desactivarlo otra vez o editarlo inactivo no vuelve a subirla
    await members.update(ownerUserId, id, { active: false });
    await members.update(ownerUserId, id, { displayName: 'Gabriela' });
    expect(await version()).toBe(1);
    // reactivarlo tampoco: vuelve a entrar con un login nuevo
    await members.update(ownerUserId, id, { active: true });
    expect(await version()).toBe(1);
  });

  it('desactivar a alguien sin cuenta anula su invitación y no revive al reactivarlo', async () => {
    const { id } = await members.create(ownerUserId, { displayName: 'Hugo' });
    await prisma.memberInvitation.create({
      data: {
        memberId: id,
        email: `hugo-${run}@test.local`,
        tokenHash: `hash-hugo-${run}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const accountOf = async () =>
      (await members.list(ownerUserId)).find((m) => m.id === id)!.account;
    expect(await accountOf()).toBe('invited');

    await members.update(ownerUserId, id, { active: false });
    const [inv] = await prisma.memberInvitation.findMany({ where: { memberId: id } });
    expect(inv.revokedAt).not.toBeNull();
    await members.update(ownerUserId, id, { active: true });
    expect(await accountOf()).toBe('none');
  });

  it('un profesional que no existe responde 404', async () => {
    await expect(
      members.update(ownerUserId, 'no-existe', { displayName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
