import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { getMembership } from '../auth/membership';
import { hashToken } from '../auth/one-time-token';
import { MembersService } from '../members/members.service';
import type {
  MemberInvitationEmailData,
  NotificationsService,
} from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { INVITATION_TTL_MS, InvitationsService } from './invitations.service';

// Invitar, reenviar, anular y aceptar contra PostgreSQL; el correo se simula
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const sent: MemberInvitationEmailData[] = [];
const notifications = {
  memberInvitation: (data: MemberInvitationEmailData) => {
    sent.push(data);
    return Promise.resolve();
  },
} as unknown as NotificationsService;
const jwt = new JwtService({ secret: 'test-invitations' });
const invitations = new InvitationsService(db, notifications, jwt);
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
        // Solo un dueño con el correo verificado invita. El otro negocio queda
        // sin verificar: un miembro ajeno igual responde 404, no 403
        data: {
          email: mail(key),
          name: key,
          password: 'x',
          emailVerifiedAt: key === 'owner' ? new Date() : null,
        },
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
  // los fijos y las cuentas creadas al aceptar invitaciones
  await prisma.user.deleteMany({
    where: {
      OR: [
        { id: { in: Object.values(users) } },
        { email: { startsWith: 'invite-', endsWith: `-${run}@test.local` } },
      ],
    },
  });
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

  it('un dueño sin el correo verificado no puede invitar (403)', async () => {
    // el invitado entraría verificado y habilitaría las reservas por él
    await prisma.user.update({
      where: { id: users.owner },
      data: { emailVerifiedAt: null },
    });
    try {
      await expect(
        invitations.create(users.owner, ids.caro, mail('caro')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await invitationsOf(ids.caro)).toHaveLength(0);
      expect(sent).toHaveLength(0);
    } finally {
      await prisma.user.update({
        where: { id: users.owner },
        data: { emailVerifiedAt: new Date() },
      });
    }
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

describe('aceptar la invitación', () => {
  // Un profesional nuevo, sin cuenta, con su invitación recién enviada
  const fresh = async (name: string) => {
    const member = await prisma.member.create({
      data: { role: 'STAFF', displayName: name, businessId },
    });
    const email = mail(name.toLowerCase());
    await invitations.create(users.owner, member.id, email);
    return { memberId: member.id, email, token: sent.at(-1)!.token };
  };
  const invalid = 'El enlace no es válido o expiró';

  it('el enlace muestra el negocio, el profesional y el correo', async () => {
    const { token, email } = await fresh('Dani');
    expect(await invitations.lookup(token)).toMatchObject({
      businessName: 'Equipo a',
      memberName: 'Dani',
      email,
      expiresAt: expect.any(Date),
    });
  });

  it('crea la cuenta verificada, enlazada y con sesión de dueño', async () => {
    const { token, email, memberId } = await fresh('Eli');
    const { accessToken } = await invitations.accept(
      token,
      'Elisa Rojas',
      'clave-segura',
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.name).toBe('Elisa Rojas');
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.password).not.toBe('clave-segura');
    expect(await bcrypt.compare('clave-segura', user.password)).toBe(true);

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
    });
    expect(member.userId).toBe(user.id);
    expect(member.displayName).toBe('Eli'); // el nombre público no cambia
    // como dueño, recibe los avisos de todas las reservas, igual que al registrarse
    expect(member.newBookingsScope).toBe('ALL');
    // Por ahora quien acepta queda como dueño, con los mismos permisos
    expect((await getMembership(db, user.id)).role).toBe('OWNER');

    const payload = await jwt.verifyAsync<{ sub: string; sv: number }>(
      accessToken,
    );
    expect(payload).toMatchObject({ sub: user.id, email, sv: 0 });

    const [inv] = await invitationsOf(memberId);
    expect(inv.usedAt).toBeInstanceOf(Date);
    const list = await members.list(users.owner);
    expect(list.find((m) => m.id === memberId)).toMatchObject({
      account: 'active',
      invitation: null,
    });
  });

  it('el invitado puede lo mismo que el dueño: invita y desactiva', async () => {
    const { token, email, memberId } = await fresh('Nico');
    await invitations.accept(token, 'Nico', 'clave-segura');
    const nico = await prisma.user.findUniqueOrThrow({ where: { email } });

    const olga = await prisma.member.create({
      data: { role: 'STAFF', displayName: 'Olga', businessId },
    });
    await invitations.create(nico.id, olga.id, mail('olga'));
    expect(sent.at(-1)).toMatchObject({ to: mail('olga'), inviterName: 'Nico' });
    expect((await members.list(nico.id)).find((m) => m.id === olga.id))
      .toMatchObject({ account: 'invited', invitation: { email: mail('olga') } });

    await members.update(nico.id, olga.id, { active: false });
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: olga.id } })).active,
    ).toBe(false);
    // Y la dueña puede quitarle el acceso al invitado
    await members.update(users.owner, memberId, { active: false });
    await expect(getMembership(db, nico.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un enlace usado ya no sirve, ni para ver ni para aceptar', async () => {
    const { token } = await fresh('Fran');
    await invitations.accept(token, 'Fran', 'clave-segura');
    await expect(invitations.lookup(token)).rejects.toThrow(invalid);
    await expect(
      invitations.accept(token, 'Fran', 'clave-segura'),
    ).rejects.toThrow(invalid);
  });

  it('un enlace inexistente, vencido o anulado no sirve', async () => {
    await expect(invitations.lookup('no-existe')).rejects.toThrow(invalid);

    const expired = await fresh('Gabi');
    await prisma.memberInvitation.updateMany({
      where: { memberId: expired.memberId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(invitations.lookup(expired.token)).rejects.toThrow(invalid);
    await expect(
      invitations.accept(expired.token, 'Gabi', 'clave-segura'),
    ).rejects.toThrow(invalid);

    const revoked = await fresh('Hugo');
    await invitations.revoke(users.owner, revoked.memberId);
    await expect(
      invitations.accept(revoked.token, 'Hugo', 'clave-segura'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await prisma.user.findUnique({ where: { email: revoked.email } }),
    ).toBeNull();
  });

  it('reenviar deja sin efecto el enlace anterior', async () => {
    const first = await fresh('Ines');
    await invitations.create(users.owner, first.memberId, first.email);
    const second = sent.at(-1)!.token;
    await expect(invitations.lookup(first.token)).rejects.toThrow(invalid);
    await expect(invitations.lookup(second)).resolves.toBeDefined();
  });

  it('si el profesional fue desactivado, el enlace no sirve', async () => {
    const { token, memberId } = await fresh('Juan');
    await prisma.member.update({
      where: { id: memberId },
      data: { active: false },
    });
    await expect(
      invitations.accept(token, 'Juan', 'clave-segura'),
    ).rejects.toThrow(invalid);
  });

  it('si el correo se registró en el intertanto, responde 409 y no enlaza', async () => {
    const { token, email, memberId } = await fresh('Kari');
    await prisma.user.create({ data: { email, name: 'Kari', password: 'x' } });
    await expect(
      invitations.accept(token, 'Kari', 'clave-segura'),
    ).rejects.toBeInstanceOf(ConflictException);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
    });
    expect(member.userId).toBeNull();
  });

  it('dos aceptaciones a la vez crean una sola cuenta', async () => {
    const { token, email } = await fresh('Lalo');
    const results = await Promise.allSettled([
      invitations.accept(token, 'Lalo', 'clave-segura'),
      invitations.accept(token, 'Lalo', 'clave-segura'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});
