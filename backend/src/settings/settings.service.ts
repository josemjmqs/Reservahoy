import { Injectable } from '@nestjs/common';
import { getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';

// Preferencias del usuario dentro de su negocio (su membresía)
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getMember(userId: string) {
    const { memberId } = await getMembership(this.prisma, userId);
    return this.prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: {
        id: true,
        notifyNewBookings: true,
        user: { select: { email: true } },
      },
    });
  }

  async get(userId: string) {
    const member = await this.getMember(userId);
    return {
      newBookingEmail: member.notifyNewBookings,
      email: member.user!.email,
    };
  }

  async update(userId: string, newBookingEmail: boolean) {
    const member = await this.getMember(userId);
    await this.prisma.member.update({
      where: { id: member.id },
      data: { notifyNewBookings: newBookingEmail },
    });
    return { newBookingEmail, email: member.user!.email };
  }
}
