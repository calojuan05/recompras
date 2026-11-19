import { crearAdaptador } from '@/lib/adapters';
import { aDate } from '@/lib/domain';
import { leerJson, manejarError, ok } from '@/lib/http';
import { leerConfiguracion } from '@/lib/services/configuracion';
import { sincronizar } from '@/lib/services/sincronizacion';
import { EsquemaSync } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';
// Traer 900 pedidos y sus contactos no cabe en el tiempo por defecto.
export const maxDuration = 300;

/**
 * Ingesta. Es idempotente: la clave es el id del pedido en el origen y, a
 * falta de ese, cliente + producto + fecha.
 */
export async function POST(peticion: Request) {
  try {
    const cuerpo = EsquemaSync.parse(await leerJson(peticion));
    const config = await leerConfiguracion();
    const fuente = cuerpo.fuente ?? config.fuenteDatos;

    const adaptador = crearAdaptador(fuente, { csv: cuerpo.csv });

    const resumen = await sincronizar(adaptador, {
      desde: cuerpo.desde ? aDate(cuerpo.desde) : undefined,
      dryRun: cuerpo.dryRun,
      refrescarClientes: cuerpo.refrescarClientes,
      actor: 'panel',
    });

    return ok(resumen);
  } catch (e) {
    return manejarError(e);
  }
}
