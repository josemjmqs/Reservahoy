import { Injectable } from '@nestjs/common';
import { assertOwner, getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

const SELECT = { name: true, slug: true, phone: true } as const;

// Datos del negocio que ven los clientes (página pública y correos)
@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const { businessId } = await getMembership(this.prisma, userId);
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: SELECT,
    });
  }

  // Solo el dueño cambia los datos del negocio
  async update(userId: string, dto: UpdateBusinessDto) {
    const m = await getMembership(this.prisma, userId);
    assertOwner(m, 'Solo el dueño puede cambiar estos datos');
    return this.prisma.business.update({
      where: { id: m.businessId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
      select: SELECT,
    });
  }
}
