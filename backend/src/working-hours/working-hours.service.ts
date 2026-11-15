import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertOwner,
  getMembership,
  scopeMemberId,
  type Membership,
} from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';
import {
  dayHoursError,
  SetWorkingHoursDto,
} from './dto/set-working-hours.dto';

@Injectable()
export class WorkingHoursService {
  constructor(private readonly prisma: PrismaService) {}

  // Resuelve el profesional objetivo. El negocio sale siempre de la
  // membresía del usuario autenticado, nunca del cliente.
  // Un profesional (STAFF) solo ve su propio horario.
  private async resolveMemberId(
    own: Membership,
    requested?: string,
  ): Promise<string> {
    const memberId = scopeMemberId(own, requested);
    if (!memberId) return own.memberId;

    const target = await this.prisma.member.findFirst({
      where: { id: memberId, businessId: own.businessId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Profesional no encontrado');
    return target.id;
  }

  async findAll(userId: string, memberId?: string) {
    const own = await getMembership(this.prisma, userId);
    const id = await this.resolveMemberId(own, memberId);
    return this.prisma.workingHours.findMany({
      where: { memberId: id },
      orderBy: { weekday: 'asc' },
    });
  }

  async replace(userId: string, dto: SetWorkingHoursDto) {
    // El horario lo define el negocio: solo el dueño lo cambia
    const own = await getMembership(this.prisma, userId);
    assertOwner(own);
    const memberId = await this.resolveMemberId(own, dto.memberId);

    const weekdays = dto.days.map((d) => d.weekday);
    if (new Set(weekdays).size !== weekdays.length) {
      throw new BadRequestException('Hay días repetidos');
    }
    for (const d of dto.days) {
      const error = dayHoursError(d);
      if (error) throw new BadRequestException(error);
    }

    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { memberId } }),
      this.prisma.workingHours.createMany({
        data: dto.days.map((d) => ({
          weekday: d.weekday,
          opensAt: d.opensAt,
          closesAt: d.closesAt,
          breakStartsAt: d.breakStartsAt ?? null,
          breakEndsAt: d.breakEndsAt ?? null,
          memberId,
        })),
      }),
    ]);
    return this.findAll(userId, memberId);
  }
}