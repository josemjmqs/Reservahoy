import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertOwner, getMembership, isOwner } from '../auth/membership';
import { pendingInvitation } from '../invitations/invitations.service';
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

  // Cada miembro con su estado de cuenta: 'active' (tiene cuenta), 'invited'
  // (invitación vigente) o 'none'. El correo invitado y su vencimiento solo los
  // ve el dueño: un profesional no ve el correo de un compañero
  async list(userId: string) {
    const m = await getMembership(this.prisma, userId);
    const members = await this.prisma.member.findMany({
      where: { businessId: m.businessId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        displayName: true,
        role: true,
        bookable: true,
        active: true,
        userId: true,
        services: { select: { serviceId: true } },
        invitations: {
          where: pendingInvitation(),
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { email: true, expiresAt: true },
        },
      },
    });
    const owner = isOwner(m);
    return members.map(({ userId: accountId, invitations, ...member }) => {
      const invitation = accountId ? null : (invitations[0] ?? null);
      return {
        ...member,
        account: accountId ? 'active' : invitation ? 'invited' : 'none',
        ...(owner && { invitation }),
      };
    });
  }

  async create(userId: string, dto: CreateMemberDto) {
    const m = await getMembership(this.prisma, userId);
    assertOwner(m);
    const { businessId } = m;
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
    const m = await getMembership(this.prisma, userId);
    assertOwner(m);
    const { businessId } = m;
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
      if (dto.active === false) await this.revokeAccess(tx, id);
      return tx.member.update({
        where: { id },
        data: { displayName: dto.displayName, active: dto.active },
        select: { id: true, displayName: true, active: true },
      });
    });
  }

  // Al desactivar a alguien se le quita el acceso al instante: se cierran sus
  // sesiones (sube sessionVersion; una persona pertenece a un solo negocio) y
  // se anula su invitación pendiente, para que no reviva si lo reactivan. Solo
  // quien lo pasa de activo a inactivo lo hace (updateMany condicional): dos
  // clics no suben la versión dos veces
  private async revokeAccess(tx: Prisma.TransactionClient, id: string) {
    const { count } = await tx.member.updateMany({
      where: { id, active: true },
      data: { active: false },
    });
    if (!count) return;
    const { userId } = await tx.member.findUniqueOrThrow({
      where: { id },
      select: { userId: true },
    });
    if (userId) {
      await tx.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
      });
    }
    await tx.memberInvitation.updateMany({
      where: { memberId: id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}