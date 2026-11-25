// Datos de prueba para desarrollo local: un negocio demo con equipo, servicios,
// horarios y reservas alrededor de hoy. Se puede correr varias veces: borra y
// vuelve a crear el negocio demo cada vez.
//
//   npx prisma db seed                 → hoy queda sin reservas
//   SEED_TODAY=1 npx prisma db seed    → también agrega reservas para hoy
//
// Panel: demo@reservahoy.local / demo1234 (dueña) y diego@reservahoy.local /
// demo1234 (profesional, STAFF) · página pública: /demo-peluqueria
//
// También crea la demo de solo lectura (/demo, la misma de producción) para
// probar "Ver el panel de demostración" en /login
import { PrismaClient } from '@prisma/client';
import {
  createBusiness,
  recreateDemo,
  removeBusiness,
  type BusinessSpec,
} from './demo-business.mts';

const SEED: BusinessSpec = {
  slug: 'demo-peluqueria',
  demo: false,
  owner: { email: 'demo@reservahoy.local', name: 'Camila Rojas' },
  staff: { email: 'diego@reservahoy.local', name: 'Diego Fuentes' },
  password: 'demo1234',
  bookingsToday: process.env.SEED_TODAY === '1',
};

// Nunca contra producción: solo bases en este computador
const url = process.env.DATABASE_URL ?? '';
const host = url ? new URL(url).hostname : '';
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(
    `Seed cancelado: DATABASE_URL apunta a "${host || '(vacío)'}". Solo se permite una base local.`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  await removeBusiness(prisma, SEED);
  await createBusiness(prisma, SEED);
  await recreateDemo(prisma);

  console.log(
    `Negocio demo listo: entra con ${SEED.owner.email} (dueña) o ${SEED.staff.email} (profesional), contraseña ${SEED.password} (página pública: /${SEED.slug}). Demo de solo lectura: /demo y "Ver el panel de demostración" en /login`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
