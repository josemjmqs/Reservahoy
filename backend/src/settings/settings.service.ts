import { Injectable } from '@nestjs/common';
import type { NotifyScope } from '@prisma/client';
import { assertOwner, getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';

// Preferencias del usuario dentro de su negocio (su membresía)
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getMember(userId: string) {
    const membership = await getMembership(this.prisma, userId);
    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: membership.memberId },
      select: {
        id: true,
        newBookingsScope: true,
        user: { select: { email: true } },
      },
    });
    return { membership, member };
  }

  async get(userId: string) {
    const { member } = await this.getMember(userId);
    return {
      newBookings: member.newBookingsScope,
      email: member.user!.email,
    };
  }

  // Recibir todas las reservas del negocio es solo de un dueño: un profesional
  // no recibe datos de clientes de otros
  async update(userId: string, newBookings: NotifyScope) {
    const { membership, member } = await this.getMember(userId);
    if (newBookings === 'ALL') {
      assertOwner(
        membership,
        'Solo un dueño puede recibir todas las reservas del negocio',
      );
    }
    await this.prisma.member.update({
      where: { id: member.id },
      data: { newBookingsScope: newBookings },
    });
    return { newBookings, email: member.user!.email };
  }
}
