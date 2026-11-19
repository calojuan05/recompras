/**
 * Borra los clientes de demostración (y en cascada sus compras y ciclos),
 * dejando intacto el catálogo y los datos reales.
 *
 *   npx tsx scripts/limpiar-demo.ts
 */

import 'dotenv/config';

import { prisma } from '../src/lib/db';

async function main() {
  const { count } = await prisma.customer.deleteMany({ where: { origen: 'demo' } });
  console.log(`Eliminados ${count} clientes de demostración con todo lo que colgaba de ellos.`);
}

main()
  .catch((error) => {
    console.error('Falló la limpieza:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
