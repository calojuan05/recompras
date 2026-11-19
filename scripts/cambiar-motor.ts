/**
 * Cambia el motor de base de datos entre SQLite y PostgreSQL.
 *
 *   npm run db:postgres
 *   npm run db:sqlite
 *
 * Prisma no admite el provider por variable de entorno, así que hay que
 * reescribir esa línea del esquema. Después toca migrar:
 *
 *   npx prisma migrate dev --name cambio-de-motor
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MOTORES = ['sqlite', 'postgresql'] as const;
type Motor = (typeof MOTORES)[number];

const destino = process.argv[2] as Motor;

if (!MOTORES.includes(destino)) {
  console.error(`Uso: tsx scripts/cambiar-motor.ts <${MOTORES.join('|')}>`);
  process.exit(1);
}

const ruta = resolve(process.cwd(), 'prisma/schema.prisma');
const esquema = readFileSync(ruta, 'utf8');

// [^}] ya cruza saltos de línea, así que no hace falta la bandera /s.
const actualizado = esquema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/,
  `$1${destino}$2`,
);

if (actualizado === esquema) {
  console.log(`El esquema ya estaba en "${destino}". Nada que hacer.`);
  process.exit(0);
}

writeFileSync(ruta, actualizado, 'utf8');

console.log(`Esquema cambiado a "${destino}".`);
console.log('');
console.log('Falta:');
console.log(`  1. Ajusta DATABASE_URL y DATABASE_PROVIDER="${destino}" en el .env`);
if (destino === 'postgresql') {
  console.log('     ejemplo: DATABASE_URL="postgresql://usuario:clave@localhost:5432/recompras"');
}
console.log('  2. npx prisma migrate dev --name cambio-de-motor');
console.log('  3. npm run seed');
