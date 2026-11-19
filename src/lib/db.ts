/**
 * Cliente de Prisma, uno solo por proceso.
 *
 * En desarrollo Next recarga los módulos en caliente; sin el singleton en
 * globalThis se abriría una conexión nueva en cada recarga hasta agotar el
 * pool. Prisma 7 exige un driver adapter explícito, y de paso eso permite
 * cambiar de SQLite a PostgreSQL sin tocar el resto del código.
 */

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

const proveedor = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';

function crearCliente(): PrismaClient {
  const adapter =
    proveedor === 'postgresql' || proveedor === 'postgres'
      ? new PrismaPg({ connectionString: url })
      : new PrismaBetterSqlite3({ url });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

const global_ = globalThis as unknown as { prismaGlobal?: PrismaClient };

export const prisma: PrismaClient = global_.prismaGlobal ?? crearCliente();

if (process.env.NODE_ENV !== 'production') {
  global_.prismaGlobal = prisma;
}
