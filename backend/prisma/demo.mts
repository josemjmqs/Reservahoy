// Crea o vuelve a crear la demo de solo lectura (reservahoy.cl/demo) en la base
// de DATABASE_URL, también en producción: lo corre a diario el workflow
// "Demo" (.github/workflows/demo.yml) para que sus reservas sigan alrededor de
// hoy. Solo toca el negocio con slug "demo" marcado como demo y sus dos
// cuentas: si el slug o los correos son de algo real, se detiene sin cambiar nada.
//
//   node --experimental-strip-types prisma/demo.mts
import { PrismaClient } from '@prisma/client';
import { DEMO, recreateDemo } from './demo-business.mts';

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient();

recreateDemo(prisma)
  .then(() => console.log(`Demo lista en /${DEMO.slug}`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
