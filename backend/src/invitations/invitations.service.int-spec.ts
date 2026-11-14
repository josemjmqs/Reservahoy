import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashToken } from '../auth/one-time-token';
import { MembersService } from '../members/members.service';
import type {
  MemberInvitationEmailData,
  NotificationsService,
} from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { INVITATION_TTL_MS, InvitationsService } from './invitations.service';

// Invitar, reenviar y anular contra PostgreSQL; el correo se simula
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const sent: MemberInvitationEmailData[] = [];
const notifications = {
  memberInvitation: (data: MemberInvitationEmailData) => {
    sent.push(data);
    return Promise.resolve();
  },
} as unknown as NotificationsService;
const invitations = new InvitationsService(db, notifications);
const members = new MembersService(db);
const run = Date.now().toString(36);
const mail = (x: string) => `invite-${x}-${run}@test.local`;

let businessId: string;
let otherBusinessId: string;
const users = {} as Record<'owner' | 'ana' | 'other', string>;
const ids = {} as Record<'beto' | 'caro' | 'inactive' | 'ana', string>;

beforeAll(async () => {
  [businessId, otherBusinessId] = (
    await Promise.all(
      ['a', 'b'].map((x) =>
        prisma.business.create({
          data: { name: `Equipo ${x}`, slug: `int-invite-${x}-${run}` },
        }),
      ),
    )
  ).map((b) => b.id);
  for (const key of ['owner', 'ana', 'other'] as const) {
    users[key] = (
      await prisma.user.create({
        data: { email: mail(key), name: key, password: 'x' },
      })
    ).id;
  }
  await prisma.member.create({
    data: {
      role: 'OWNER',
      displayName: 'Dueña',
      userId: users.owner,
      businessId,
    },
  });
  await prisma.member.create({
    data: {
      role: 'OWNER',
      displayName: 'Otro',
      userId: users.other,
      businessId: otherBusinessId,
    },
  });
  const staff = async (displayName: string, extra = {}) =>
    (
      await prisma.member.create({
        data: { role: 'STAFF', displayName, businessId, ...extra },
      })
    ).id;
  ids.beto = await staff('Beto');
  ids.caro = await staff('Caro');
  ids.inactive = await staff('Inactivo', { active: false });
  ids.ana = await staff('Ana', { userId: users.ana });
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  const businesses = [businessId, otherBusinessId];
  await prisma.member.deleteMany({ where: { businessId: { in: businesses } } }); // borra invitaciones en cascada
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.business.deleteMany({ where: { id: { in: businesses } } });
  await prisma.$disconnect();
});

const invitationsOf = (memberId: string) =>
  prisma.memberInvitation.findMany({
    where: { memberId },
    orderBy: { createdAt: 'asc' },
  });

describe('invitar', () => {
  it('el dueño invita: se guarda solo el hash y sale un correo con el enlace', async () => {
    const before = Date.now();
    const res = await invitations.create(users.owner, ids.beto, mail('beto'));
    expect(res).toMatchObject({ status: 'invited', email: mail('beto') });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: mail('beto'),
      memberName: 'Beto',
      businessName: 'Equipo a',
      inviterName: 'Dueña',
    });
    const [saved] = await invitationsOf(ids.beto);
    expect(saved.tokenHash).toBe(hashToken(sent[0].token));
    expect(saved.tokenHash).not.toBe(sent[0].token);
    expect(saved.email).toBe(mail('beto'));
    const ttl = saved.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(INVITATION_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(INVITATION_TTL_MS + 5000);
  });

  it('reenviar anula la anterior y deja una sola vigente', async () => {
    await invitations.create(users.owner, ids.beto, mail('beto2'));
    const all = await invitationsOf(ids.beto);
    expect(all).toHaveLength(2);
    expect(all[0].revokedAt).toBeInstanceOf(Date);
    expect(all[1]).toMatchObject({ revokedAt: null, email: mail('beto2') });
  });

  it('la cuarta invitación en una hora al mismo profesional responde 429', async () => {
    await invitations.create(users.owner, ids.beto, mail('beto3'));
    const err = await invitations
      .create(users.owner, ids.beto, mail('beto4'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(sent).toHaveLength(1);
  });

  it('un profesional no puede invitar (403)', async () => {
    await expect(
      invitations.create(users.ana, ids.caro, mail('caro')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('otro negocio no puede invitar a un profesional ajeno (404)', async () => {
    await expect(
      invitations.create(users.other, ids.caro, mail('caro')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no invita a quien ya tiene cuenta ni a un profesional inactivo', async () => {
    await expect(
      invitations.create(users.owner, ids.ana, mail('ana2')),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      invitations.create(users.owner, ids.inactive, mail('inactivo')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un correo que ya tiene cuenta no se invita (409)', async () => {
    await expect(
      invitations.create(users.owner, ids.caro, mail('other')),
    ).rejects.toThrow('Ese correo ya tiene una cuenta en Reservahoy');
    expect(await invitationsOf(ids.caro)).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe('anular', () => {
  it('deja al profesional sin invitación vigente', async () => {
    await invitations.create(users.owner, ids.caro, mail('caro'));
    expect(await invitations.revoke(users.owner, ids.caro)).toEqual({
      status: 'none',
    });
    const [only] = await invitationsOf(ids.caro);
    expect(only.revokedAt).toBeInstanceOf(Date);
  });

  it('anular sin invitación pendiente no es un error', async () => {
    await expect(invitations.revoke(users.owner, ids.caro)).resolves.toEqual({
      status: 'none',
    });
  });

  it('un profesional no anula (403) y otro negocio tampoco (404)', async () => {
    await expect(
      invitations.revoke(users.ana, ids.beto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      invitations.revoke(users.other, ids.beto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borrar al miembro borra sus invitaciones', async () => {
    const temp = await prisma.member.create({
      data: { role: 'STAFF', displayName: 'Temporal', businessId },
    });
    await invitations.create(users.owner, temp.id, mail('temp'));
    await prisma.member.delete({ where: { id: temp.id } });
    expect(await invitationsOf(temp.id)).toEqual([]);
  });
});

describe('estado de cuenta en GET /members', () => {
  const byName = <T extends { displayName: string }>(list: T[], name: string) =>
    list.find((m) => m.displayName === name)!;

  it('el dueño ve el estado y la invitación vigente de cada miembro', async () => {
    const list = await members.list(users.owner);
    expect(byName(list, 'Dueña')).toMatchObject({
      account: 'active',
      invitation: null,
    });
    expect(byName(list, 'Ana')).toMatchObject({
      account: 'active',
      invitation: null,
    });
    expect(byName(list, 'Beto')).toMatchObject({
      account: 'invited',
      invitation: { email: mail('beto3'), expiresAt: expect.any(Date) },
    });
    expect(byName(list, 'Caro')).toMatchObject({
      account: 'none',
      invitation: null,
    });
  });

  it('una invitación vencida ya no cuenta como vigente', async () => {
    await prisma.memberInvitation.updateMany({
      where: { memberId: ids.beto, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const list = await members.list(users.owner);
    expect(byName(list, 'Beto')).toMatchObject({
      account: 'none',
      invitation: null,
    });
  });

  it('un profesional ve el estado, pero no el correo invitado', async () => {
    await invitations.create(users.owner, ids.caro, mail('caro-final'));
    const list = await members.list(users.ana);
    expect(byName(list, 'Caro').account).toBe('invited');
    expect(byName(list, 'Caro')).not.toHaveProperty('invitation');
    expect(JSON.stringify(list)).not.toContain(mail('caro-final'));
  });
});
