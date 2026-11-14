import { ForbiddenException } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

// Membresía activa del usuario autenticado dentro de su negocio
export interface Membership {
  memberId: string;
  businessId: string;
  role: MemberRole;
  timezone: string;
}

// El negocio sale SIEMPRE de la membresía del usuario autenticado, nunca del
// cliente. Una membresía desactivada no da acceso. El orden fijo evita que, si
// alguien tuviera más de una, cada petición tome un negocio distinto
export async function getMembership(
  prisma: PrismaService,
  userId: string,
): Promise<Membership> {
  const member = await prisma.member.findFirst({
    where: { userId, active: true },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      role: true,
      business: { select: { id: true, timezone: true } },
    },
  });
  if (!member) throw new ForbiddenException('No perteneces a ningún negocio');
  return {
    memberId: member.id,
    businessId: member.business.id,
    role: member.role,
    timezone: member.business.timezone,
  };
}

export function assertOwner(
  m: Membership,
  message = 'Solo el dueño puede hacer esto',
) {
  if (m.role !== 'OWNER') throw new ForbiddenException(message);
}
