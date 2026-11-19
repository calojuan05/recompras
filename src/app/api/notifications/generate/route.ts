import { leerJson, manejarError, ok } from '@/lib/http';
import { generarNotificaciones } from '@/lib/services/notificaciones';
import { EsquemaGeneracion } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

/** Prepara mensajes para los ciclos en ventana. No envía nada. */
export async function POST(peticion: Request) {
  try {
    const opciones = EsquemaGeneracion.parse(await leerJson(peticion));
    const resumen = await generarNotificaciones({ limite: opciones.limite, actor: 'panel' });
    return ok(resumen);
  } catch (e) {
    return manejarError(e);
  }
}
