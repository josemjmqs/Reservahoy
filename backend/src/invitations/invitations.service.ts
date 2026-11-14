import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertOwner, getMembership } from '../auth/membership';
import { hashToken, newToken } from '../auth/one-time-token';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
export const INVITATIONS_MAX_PER_HOUR = 3; // por miembro

// Invitación vigente: ni usada, ni anulada, ni vencida
export const pendingInvitation = (now = new Date()) => ({
  usedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
});

// Invitaciones por correo para que un profesional del equipo cree su cuenta.
// Solo el dueño invita; el negocio sale siempre de su membresía
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
    if (taken) {
      throw new ConflictException(
        'Ese correo ya tiene una cuenta en Reservahoy',
      );
    }
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
