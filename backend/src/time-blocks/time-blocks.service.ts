import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TimeBlock } from '@prisma/client';
import { getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeBlockDto } from './dto/create-time-block.dto';
import { exceedsDays, isAllDay, resolveBlockRange } from './block-range';

const MAX_DAYS = 366;

@Injectable()
export class TimeBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(
    block: TimeBlock,
    timezone: string,
    names: Map<string, string>,
  ) {
    return {
      id: block.id,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
      allDay: isAllDay(block, timezone),
      member: block.memberId
        ? {
            id: block.memberId,
            displayName: names.get(block.memberId) ?? 'Profesional',
          }
        : null,
    };
  }

  private async memberNames(businessId: string, ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map<string, string>();
    const members = await this.prisma.member.findMany({
      where: { id: { in: unique }, businessId },
      select: { id: true, displayName: true },
    });
    return new Map(members.map((m) => [m.id, m.displayName]));
  }

  // Bloqueos vigentes o futuros (los que ya terminaron no se muestran)
  async list(userId: string) {
    const { businessId, timezone } = await getMembership(this.prisma, userId);
    const blocks = await this.prisma.timeBlock.findMany({
      where: { businessId, endsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
    const names = await this.memberNames(
      businessId,
      blocks.map((b) => b.memberId),
    );
    return {
      timezone,
      blocks: blocks.map((b) => this.serialize(b, timezone, names)),
    };
  }

  async create(userId: string, dto: CreateTimeBlockDto) {
    const { businessId, timezone } = await getMembership(this.prisma, userId);

    // El profesional debe ser de tu negocio (404 si no)
    const names = new Map<string, string>();
    if (dto.memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: dto.memberId, businessId },
        select: { id: true, displayName: true },
      });
      if (!member) throw new NotFoundException('Profesional no encontrado');
      names.set(member.id, member.displayName);
    }

    const range = resolveBlockRange({ ...dto, timezone });
    if (!range) {
      throw new BadRequestException('El término debe ser posterior al inicio');
    }
    if (range.endsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Ese período ya pasó');
    }
    if (exceedsDays(range, timezone, MAX_DAYS)) {
      throw new BadRequestException('Un bloqueo no puede durar más de un año');
    }

    // Crear y contar en una transacción: si el conteo falla, no queda un
    // bloqueo guardado del que el panel no se enteró
    const [block, conflicts] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.timeBlock.create({
        data: {
          ...range,
          reason: dto.reason?.trim() || null,
          businessId,
          memberId: dto.memberId ?? null,
        },
      });
      // Las reservas existentes no se cancelan solas: se avisa cuántas hay
      const count = await tx.booking.count({
        where: {
          businessId,
          ...(dto.memberId && { memberId: dto.memberId }),
          status: { in: ['PENDING', 'CONFIRMED'] },
          startsAt: { lt: range.endsAt },
          endsAt: { gt: range.startsAt },
        },
      });
      return [created, count] as const;
    });

    return {
      ...this.serialize(block, timezone, names),
      conflicts,
    };
  }

  async remove(userId: string, id: string) {
    const { businessId } = await getMembership(this.prisma, userId);
    const block = await this.prisma.timeBlock.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!block) throw new NotFoundException('Bloqueo no encontrado');
    await this.prisma.timeBlock.delete({ where: { id } });
    return { id };
  }
}
