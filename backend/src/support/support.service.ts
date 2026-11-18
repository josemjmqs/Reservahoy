import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { SupportKind } from '@prisma/client';
import { getMembership } from '../auth/membership';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export const SUPPORT_MAX_PER_HOUR = 5; // por miembro
const USER_AGENT_MAX = 300;

export interface SupportRequestInput {
  kind: SupportKind;
  message: string;
  page?: string;
  userAgent?: string;
}

// "Ayuda y sugerencias" del panel: cualquier miembro activo (dueño o
// profesional) le escribe al equipo de Reservahoy. Se guarda en la base y se
// avisa por correo, con el del usuario para responderle directo
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: SupportRequestInput) {
    const m = await getMembership(this.prisma, userId);

    const recent = await this.prisma.supportRequest.count({
      where: {
        memberId: m.memberId,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= SUPPORT_MAX_PER_HOUR) {
      throw new HttpException(
        'Ya nos enviaste varios mensajes; intenta de nuevo en una hora',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const request = await this.prisma.supportRequest.create({
      data: {
        kind: input.kind,
        message: input.message,
        page: input.page ?? null,
        userAgent: input.userAgent?.slice(0, USER_AGENT_MAX) || null,
        memberId: m.memberId,
        businessId: m.businessId,
      },
      select: {
        id: true,
        kind: true,
        message: true,
        page: true,
        userAgent: true,
        createdAt: true,
        member: {
          select: {
            displayName: true,
            role: true,
            user: { select: { name: true, email: true } },
          },
        },
        business: { select: { name: true, slug: true } },
      },
    });

    // sin await: el panel no espera al correo, y si no sale queda en la base
    void this.notifications.supportRequest({
      id: request.id,
      kind: request.kind,
      message: request.message,
      page: request.page,
      userAgent: request.userAgent,
      createdAt: request.createdAt,
      userName: request.member.user!.name,
      userEmail: request.member.user!.email,
      memberName: request.member.displayName,
      role: request.member.role,
      businessName: request.business.name,
      businessSlug: request.business.slug,
    });

    return { id: request.id, createdAt: request.createdAt };
  }
}
