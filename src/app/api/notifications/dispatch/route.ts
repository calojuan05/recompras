import { leerJson, manejarError, ok } from '@/lib/http';
import { despacharOutbox } from '@/lib/services/notificaciones';
import { EsquemaDespacho } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

/**
 * Procesa la bandeja pendiente. En modo simulado (el de fábrica) no sale nada
 * hacia ningún proveedor: los mensajes quedan marcados como SIMULADO.
 */
export async function POST(peticion: Request) {
  try {
    const opciones = EsquemaDespacho.parse(await leerJson(peticion));
    const resumen = await despacharOutbox({ ...opciones, actor: 'panel' });
    return ok(resumen);
  } catch (e) {
    return manejarError(e);
  }
}
