import { ForbiddenException, NotFoundException } from '@nestjs/common';
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

// Único criterio de rol: todo lo que no es dueño tiene permisos limitados, así
// un rol nuevo empieza sin acceso de dueño en vez de heredarlo por omisión
export const isOwner = (m: Membership) => m.role === 'OWNER';

export function assertOwner(
  m: Membership,
  message = 'Solo el dueño puede hacer esto',
) {
  if (!isOwner(m)) throw new ForbiddenException(message);
}

// Profesional sobre el que se consulta. El dueño elige cualquiera (o ninguno:
// todo el negocio); un profesional solo se ve a sí mismo y pedir a otro
// responde 404, igual que un recurso de otro negocio
export function scopeMemberId(
  m: Membership,
  requested?: string,
): string | undefined {
  if (isOwner(m)) return requested;
  if (requested && requested !== m.memberId) {
    throw new NotFoundException('Profesional no encontrado');
  }
  return m.memberId;
}
