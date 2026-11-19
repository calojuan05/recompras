import { hoy } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { manejarError, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [clientes, compras, ciclos] = await Promise.all([
      prisma.customer.count(),
      prisma.purchase.count(),
      prisma.repurchaseCycle.count(),
    ]);

    return ok({
      estado: 'ok',
      dia: hoy(),
      motor: process.env.CRON_ACTIVO === 'false' ? 'manual' : 'activo',
      modoEnvio: process.env.MODO_ENVIO ?? 'simulado',
      base: { clientes, compras, ciclos },
    });
  } catch (e) {
    return manejarError(e);
  }
}
