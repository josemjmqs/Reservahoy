import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';
import { SetWorkingHoursDto } from './dto/set-working-hours.dto';

@Injectable()
export class WorkingHoursService {
  constructor(private readonly prisma: PrismaService) {}

  // Resuelve el profesional objetivo. El negocio sale siempre de la
  // membresía del usuario autenticado, nunca del cliente.
  private async resolveMemberId(
    userId: string,
    memberId?: string,
  ): Promise<string> {
    const own = await getMembership(this.prisma, userId);
    if (!memberId) return own.memberId;

    const target = await this.prisma.member.findFirst({
      where: { id: memberId, businessId: own.businessId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Profesional no encontrado');
    return target.id;
  }

  async findAll(userId: string, memberId?: string) {
    const id = await this.resolveMemberId(userId, memberId);
    return this.prisma.workingHours.findMany({
      where: { memberId: id },
      orderBy: { weekday: 'asc' },
    });
  }

  async replace(userId: string, dto: SetWorkingHoursDto) {
    const memberId = await this.resolveMemberId(userId, dto.memberId);

    const weekdays = dto.days.map((d) => d.weekday);
    if (new Set(weekdays).size !== weekdays.length) {
      throw new BadRequestException('Hay días repetidos');
    }
    for (const d of dto.days) {
      if (d.opensAt >= d.closesAt) {
        throw new BadRequestException(
          'La hora de apertura debe ser anterior al cierre',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { memberId } }),
      this.prisma.workingHours.createMany({
        data: dto.days.map((d) => ({ ...d, memberId })),
      }),
    ]);
    return this.findAll(userId, memberId);
  }
}