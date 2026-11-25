// Negocio de ejemplo (una peluquería con equipo, servicios, horarios y reservas
// alrededor de hoy) que usan el seed local (prisma/seed.mts) y la demo de
// producción (prisma/demo.mts). Se puede crear varias veces: primero se borra
// el anterior con el mismo slug y los mismos correos.
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';

export const TZ = 'America/Santiago';

export interface BusinessSpec {
  slug: string;
  // Negocio de demostración: solo lectura y sin reservas públicas
  demo: boolean;
  owner: { email: string; name: string };
  staff: { email: string; name: string };
  // Sin contraseña (null), las cuentas no pueden iniciar sesión con el formulario
  password: string | null;
  bookingsToday: boolean;
}

// La demo de producción: reservahoy.cl/demo. Se entra con POST /auth/demo
export const DEMO: BusinessSpec = {
  slug: 'demo',
  demo: true,
  owner: { email: 'duena@demo.reservahoy.cl', name: 'Camila Rojas' },
  staff: { email: 'profesional@demo.reservahoy.cl', name: 'Diego Fuentes' },
  password: null,
  bookingsToday: true,
};

export async function removeBusiness(prisma: PrismaClient, spec: BusinessSpec) {
  const business = await prisma.business.findUnique({
    where: { slug: spec.slug },
  });
  if (business) {
    const businessId = business.id;
    await prisma.booking.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.timeBlock.deleteMany({ where: { businessId } });
    await prisma.supportRequest.deleteMany({ where: { businessId } });
    await prisma.workingHours.deleteMany({ where: { member: { businessId } } });
    await prisma.member.deleteMany({ where: { businessId } });
    await prisma.service.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  }
  for (const { email } of [spec.owner, spec.staff]) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    await prisma.member.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

// La demo de producción nunca debe borrar un negocio o una cuenta reales: si
// el slug o los correos ya son de algo que no es la demo, se detiene
export async function assertOnlyDemoData(
  prisma: PrismaClient,
  spec: BusinessSpec,
) {
  const business = await prisma.business.findUnique({
    where: { slug: spec.slug },
  });
  if (business && !business.demo) {
    throw new Error(
      `El slug "${spec.slug}" es de un negocio que no es la demo: no se toca`,
    );
  }
  for (const { email } of [spec.owner, spec.staff]) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { members: { include: { business: true } } },
    });
    if (user?.members.some((m) => !m.business.demo)) {
      throw new Error(`${email} pertenece a un negocio que no es la demo: no se toca`);
    }
  }
}

// El n-ésimo día hábil (lunes a sábado) desde hoy; negativo hacia atrás
function workday(n: number) {
  let day = DateTime.now().setZone(TZ).startOf('day');
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0;) {
    day = day.plus({ days: step });
    if (day.weekday !== 7) left--;
  }
  return day;
}

export async function createBusiness(prisma: PrismaClient, spec: BusinessSpec) {
  // Sin contraseña: una al azar que nadie conoce
  const password = await bcrypt.hash(
    spec.password ?? randomBytes(32).toString('hex'),
    10,
  );
  const user = await prisma.user.create({
    data: {
      email: spec.owner.email,
      name: spec.owner.name,
      password,
      emailVerifiedAt: new Date(),
    },
  });
  // Profesional con cuenta: solo ve y cambia lo suyo (pruebas de permisos STAFF)
  const staffUser = await prisma.user.create({
    data: {
      email: spec.staff.email,
      name: spec.staff.name,
      password,
      emailVerifiedAt: new Date(),
    },
  });

  const business = await prisma.business.create({
    data: {
      name: 'Peluquería Demo',
      slug: spec.slug,
      demo: spec.demo,
      phone: '+56 9 1234 5678',
      address: 'Av. Providencia 1234, Providencia',
    },
  });
  const businessId = business.id;

  const camila = await prisma.member.create({
    data: {
      role: 'OWNER',
      newBookingsScope: 'ALL',
      displayName: spec.owner.name.split(' ')[0],
      userId: user.id,
      businessId,
    },
  });
  const diego = await prisma.member.create({
    data: {
      role: 'STAFF',
      displayName: spec.staff.name.split(' ')[0],
      userId: staffUser.id,
      businessId,
    },
  });

  const service = (
    name: string,
    durationMin: number,
    price: number,
    category: string,
    memberIds: string[],
    extra: { description?: string; imageKey?: string } = {},
  ) =>
    prisma.service.create({
      data: {
        name,
        durationMin,
        price,
        category,
        businessId,
        ...extra,
        members: { create: memberIds.map((memberId) => ({ memberId })) },
      },
    });

  const corte = await service('Corte de pelo', 45, 12000, 'Pelo', [
    camila.id,
    diego.id,
  ]);
  const barba = await service('Perfilado de barba', 30, 8000, 'Barba', [
    camila.id,
    diego.id,
  ]);
  const color = await service('Color completo', 90, 35000, 'Pelo', [camila.id]);
  const lavado = await service('Lavado y peinado', 30, 10000, 'Pelo', [
    camila.id,
  ]);

  // Tipos de corte con foto, en su propia categoría (va después de Pelo y
  // Barba, así que parte cerrada). Las fotos están en frontend/public/seed/cortes:
  // la API arma la URL con R2_PUBLIC_URL, así que en local se ven con
  // R2_PUBLIC_URL=http://localhost:3001 (sin esa variable, los servicios quedan
  // sin foto) y en producción el workflow de la demo las sube al bucket.
  // Fotos de Unsplash (licencia de Unsplash, uso libre): degradado, Amritpal
  // Singh; pompadour, Ahmad Ebadi; rapado, Mitchell Orr; bob, Lu; capas,
  // "Jessie Dee" Dabrowski
  const photo = (file: string) => `seed/cortes/${file}.webp`;
  await service('Degradado', 45, 14000, 'Cortes', [camila.id, diego.id], {
    description:
      'Máquina a los costados que se funde con el largo de arriba. Puede llevar un diseño con navaja.',
    imageKey: photo('degradado'),
  });
  await service('Pompadour', 50, 16000, 'Cortes', [camila.id, diego.id], {
    description:
      'Volumen hacia atrás arriba y costados cortos. Incluye el peinado con cera o pomada.',
    imageKey: photo('pompadour'),
  });
  await service('Rapado', 20, 8000, 'Cortes', [camila.id, diego.id], {
    description: 'Todo a máquina, al mismo largo o con un leve degradado en la nuca.',
    imageKey: photo('rapado'),
  });
  await service('Corte bob', 60, 20000, 'Cortes', [camila.id], {
    description:
      'Recto, a la altura de la mandíbula o del mentón. Incluye lavado y secado.',
    imageKey: photo('bob'),
  });
  await service('Corte en capas', 60, 22000, 'Cortes', [camila.id], {
    description:
      'Para pelo largo: capas que dan movimiento y quitan peso. Incluye lavado y secado.',
    imageKey: photo('capas'),
  });

  // Lunes a viernes 10:00–19:00 y sábado 10:00–14:00 para ambos
  for (const memberId of [camila.id, diego.id]) {
    await prisma.workingHours.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        opensAt: '10:00',
        closesAt: weekday === 6 ? '14:00' : '19:00',
        memberId,
      })),
    });
  }

  // nombre, correo y teléfono (opcional)
  const customerRows: [string, string, string | null][] = [
    ['Valentina Muñoz', 'valentina@ejemplo.cl', '+56 9 8765 4321'],
    ['Matías González', 'matias@ejemplo.cl', null],
    ['Fernanda Soto', 'fernanda@ejemplo.cl', '+56 9 5555 1234'],
    ['Benjamín Díaz', 'benjamin@ejemplo.cl', null],
    ['Josefa Pérez', 'josefa@ejemplo.cl', '+56 9 4444 9876'],
  ];
  const customers = await Promise.all(
    customerRows.map(([name, email, phone]) =>
      prisma.customer.create({ data: { name, email, phone, businessId } }),
    ),
  );

  type Status = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  const book = (
    day: DateTime,
    time: string,
    memberId: string,
    customer: number,
    services: { id: string; durationMin: number }[],
    status: Status = 'CONFIRMED',
  ) => {
    const [hour, minute] = time.split(':').map(Number);
    const start = day.set({ hour, minute });
    const minutes = services.reduce((sum, s) => sum + s.durationMin, 0);
    return prisma.booking.create({
      data: {
        startsAt: start.toJSDate(),
        endsAt: start.plus({ minutes }).toJSDate(),
        status,
        businessId,
        memberId,
        customerId: customers[customer].id,
        items: {
          create: services.map((s, position) => ({
            serviceId: s.id,
            position,
          })),
        },
      },
    });
  };

  const yesterday = workday(-1);
  await book(yesterday, '10:00', camila.id, 0, [corte], 'COMPLETED');
  await book(yesterday, '12:00', diego.id, 1, [barba], 'NO_SHOW');

  if (spec.bookingsToday) {
    const today = DateTime.now().setZone(TZ).startOf('day');
    await book(today, '11:00', camila.id, 2, [corte, lavado]);
    await book(today, '16:30', diego.id, 3, [barba], 'PENDING');
  }

  const next = workday(1);
  await book(next, '10:00', camila.id, 2, [corte, barba]);
  await book(next, '11:00', diego.id, 3, [corte]);
  await book(next, '15:00', camila.id, 4, [color], 'CANCELLED');

  await book(workday(2), '12:00', camila.id, 4, [lavado], 'PENDING');
  await book(workday(4), '11:00', diego.id, 1, [barba]);
}

// Crea (o vuelve a crear) la demo de solo lectura, sin tocar nada que no sea suyo
export async function recreateDemo(prisma: PrismaClient) {
  await assertOnlyDemoData(prisma, DEMO);
  await removeBusiness(prisma, DEMO);
  await createBusiness(prisma, DEMO);
}
