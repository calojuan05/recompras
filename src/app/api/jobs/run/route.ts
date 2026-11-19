import { manejarError, ok } from '@/lib/http';
import { ejecutarJobDiario, ultimaEjecucion } from '@/lib/services/motor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** El botón "Ejecutar ahora" del panel: corre el job sin esperar a las 08:00. */
export async function POST() {
  try {
    return ok(await ejecutarJobDiario('panel'));
  } catch (e) {
    return manejarError(e);
  }
}

export async function GET() {
  try {
    const ultima = await ultimaEjecucion();
    return ok({
      ultimaEjecucion: ultima?.creadoEn ?? null,
      resumen: ultima?.payloadDespues ? JSON.parse(ultima.payloadDespues) : null,
      cronActivo: process.env.CRON_ACTIVO !== 'false',
      horario: process.env.CRON_HORA ?? '0 8 * * *',
    });
  } catch (e) {
    return manejarError(e);
  }
}
