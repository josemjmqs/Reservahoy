import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertOwner, getMembership } from '../auth/membership';
import { hashToken, newToken } from '../auth/one-time-token';
import { signSession } from '../auth/session';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
export const INVITATIONS_MAX_PER_HOUR = 3; // por miembro
const EMAIL_TAKEN = 'Ese correo ya tiene una cuenta en Reservahoy';

// Invitación vigente: ni usada, ni anulada, ni vencida
export const pendingInvitation = (now = new Date()) => ({
  usedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
});

// Invitaciones por correo para que un profesional del equipo cree su cuenta.
// Solo el dueño invita; el negocio sale siempre de su membresía. Por ahora quien
// acepta queda como dueño (OWNER), con los mismos permisos que quien lo invitó
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly jwt: JwtService,
  ) {}

  // La invitación del token, si todavía sirve: vigente, y el profesional activo
  // y sin cuenta. Si no, el mismo error que los otros enlaces de un solo uso
  private async usable(
    db: Pick<PrismaService, 'memberInvitation'>,
    token: string,
  ) {
    const invitation = await db.memberInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        member: {
          select: {
            id: true,
            displayName: true,
            active: true,
            userId: true,
            business: { select: { name: true } },
          },
        },
      },
    });
    if (
      !invitation ||
      invitation.usedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      !invitation.member.active ||
      invitation.member.userId
    ) {
      throw new BadRequestException('El enlace no es válido o expiró');
    }
    return invitation;
  }

  // Lo que muestra la página de la invitación antes de aceptar
  async lookup(token: string) {
    const inv = await this.usable(this.prisma, token);
    return {
      businessName: inv.member.business.name,
      memberName: inv.member.displayName,
      email: inv.email,
      expiresAt: inv.expiresAt,
    };
  }

  // Crea la cuenta del profesional, verificada (abrir el enlace prueba el
  // correo), la enlaza a su membresía como dueño y devuelve el token de sesión.
  // Todo en una transacción: dos clics a la vez crean una sola cuenta
  async accept(token: string, name: string, password: string) {
    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma
      .$transaction(async (tx) => {
        const inv = await this.usable(tx, token);
        const taken = await tx.user.findUnique({
          where: { email: inv.email },
          select: { id: true },
        });
        if (taken) throw new ConflictException(EMAIL_TAKEN);

        const now = new Date();
        const created = await tx.user.create({
          data: {
            email: inv.email,
            name,
            password: hashed,
            emailVerifiedAt: now,
          },
        });
        // Solo si nadie más la tomó en el intertanto (si no, se deshace todo)
        const linked = await tx.member.updateMany({
          where: { id: inv.member.id, userId: null, active: true },
          data: { userId: created.id, role: 'OWNER' },
        });
        const used = await tx.memberInvitation.updateMany({
          where: { id: inv.id, usedAt: null, revokedAt: null },
          data: { usedAt: now },
        });
        if (linked.count !== 1 || used.count !== 1) {
          throw new ConflictException('Esta invitación ya fue aceptada');
        }
        await tx.memberInvitation.updateMany({
          where: { memberId: inv.member.id, usedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
        return created;
      })
      .catch((e: unknown) => {
        // Otro registro o aceptación con el mismo correo ganó la carrera
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        throw e;
      });

    const accessToken = await signSession(this.jwt, {
      userId: user.id,
      email: user.email,
      sv: user.sessionVersion,
    });
    return { accessToken };
  }

  // El dueño y el miembro (de su negocio) al que apunta la invitación
  private async ownerAndMember(userId: string, memberId: string) {
    const m = await getMembership(this.prisma, userId);
    assertOwner(m);
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, businessId: m.businessId },
      select: {
        id: true,
        displayName: true,
        active: true,
        userId: true,
        business: { select: { name: true } },
      },
    });
    if (!member) throw new NotFoundException('Profesional no encontrado');
    return { m, member };
  }

  // Invita o reenvía: la invitación nueva anula la que estaba pendiente
  async create(userId: string, memberId: string, email: string) {
    const { m, member } = await this.ownerAndMember(userId, memberId);
    // Quien acepta queda como dueño y verificado: si invitara un dueño sin
    // verificar, el invitado habilitaría las reservas por él (acceptsBookings).
    // Va después de buscar al miembro: uno de otro negocio sigue dando 404
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!account.emailVerifiedAt) {
      throw new ForbiddenException(
        'Verifica tu correo antes de invitar a tu equipo',
      );
    }
    if (member.userId) {
      throw new ConflictException('Ese profesional ya tiene una cuenta');
    }
    if (!member.active) {
      throw new BadRequestException('Activa al profesional antes de invitarlo');
    }
    // Una persona pertenece a un solo negocio: un correo con cuenta no se invita
    const taken = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) throw new ConflictException(EMAIL_TAKEN);
    const now = new Date();
    const recent = await this.prisma.memberInvitation.count({
      where: {
        memberId,
        createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    });
    if (recent >= INVITATIONS_MAX_PER_HOUR) {
      throw new HttpException(
        'Ya enviaste varias invitaciones a este profesional; intenta en una hora',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = newToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.memberInvitation.updateMany({
        where: { memberId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.memberInvitation.create({
        data: { memberId, email, tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    const inviter = await this.prisma.member.findUniqueOrThrow({
      where: { id: m.memberId },
      select: { displayName: true },
    });
    // sin await: el panel no espera al correo
    void this.notifications.memberInvitation({
      to: email,
      memberName: member.displayName,
      businessName: member.business.name,
      inviterName: inviter.displayName,
      token,
    });
    return { status: 'invited' as const, email, expiresAt };
  }

  // Anula la invitación pendiente; si no había, no es un error
  async revoke(userId: string, memberId: string) {
    await this.ownerAndMember(userId, memberId);
    await this.prisma.memberInvitation.updateMany({
      where: { memberId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { status: 'none' as const };
  }
}
