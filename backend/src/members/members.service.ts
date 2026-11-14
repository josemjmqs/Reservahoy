import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  // Todos los servicios deben ser del mismo negocio
  private async assertServices(businessId: string, ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.service.count({
      where: { id: { in: ids }, businessId },
    });
    if (count !== ids.length) throw new BadRequestException('Servicio inválido');
  }

  async list(userId: string) {
    const { businessId } = await getMembership(this.prisma, userId);
    return this.prisma.member.findMany({
      where: { businessId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        displayName: true,
        role: true,
        bookable: true,
        active: true,
        services: { select: { serviceId: true } },
      },
    });
  }

  async create(userId: string, dto: CreateMemberDto) {
    const { businessId } = await getMembership(this.prisma, userId);
    const serviceIds = dto.serviceIds ?? [];
    await this.assertServices(businessId, serviceIds);
    return this.prisma.member.create({
      data: {
        role: 'STAFF',
        displayName: dto.displayName,
        businessId,
        services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
      },
      select: { id: true, displayName: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateMemberDto) {
    const { businessId } = await getMembership(this.prisma, userId);
    const member = await this.prisma.member.findFirst({ where: { id, businessId } });
    if (!member) throw new NotFoundException('Profesional no encontrado');

    if (dto.serviceIds) await this.assertServices(businessId, dto.serviceIds);

    // El dueño no puede desactivarse a sí mismo
    if (dto.active === false && member.userId === userId) {
      throw new BadRequestException('No puedes desactivar tu propio perfil');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.serviceIds) {
        await tx.memberService.deleteMany({ where: { memberId: id } });
        await tx.memberService.createMany({
          data: dto.serviceIds.map((serviceId) => ({ memberId: id, serviceId })),
        });
      }
      return tx.member.update({
        where: { id },
        data: { displayName: dto.displayName, active: dto.active },
        select: { id: true, displayName: true, active: true },
      });
    });
  }
}