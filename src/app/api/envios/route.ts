import { error, ok } from '@/lib/http';
import { listarEnvios, sincronizarEnvios } from '@/lib/services/envios';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(await listarEnvios());
  } catch (e) {
    return error('ERROR_INTERNO', e instanceof Error ? e.message : 'No se pudieron leer los envíos.');
  }
}

/**
 * Actualiza los envíos contra Lucid Bot.
 *
 * `desde` (AAAA-MM-DD) recorta por fecha de creación del pedido. Sin ella
 * miraría los 1.100 históricos, y pedir tantos detalles seguidos hace que la
 * API corte el acceso.
 */
export async function POST(peticion: Request) {
  try {
    const cuerpo = await peticion.json().catch(() => ({}));
    const desde = typeof cuerpo?.desde === 'string' ? cuerpo.desde : undefined;
    const maxConsultas =
      typeof cuerpo?.maxConsultas === 'number' ? cuerpo.maxConsultas : undefined;

    // Sin 'desde' el servicio usa el mes en curso. El histórico completo no se
    // consulta nunca desde aquí: son mil y pico pedidos y agota la API.
    const resumen = await sincronizarEnvios({ desde, maxConsultas });
    return ok(resumen);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Falló la sincronización.';
    // Un fallo de red se lee distinto a un fallo del programa, y quien mira la
    // pantalla necesita saber cuál de los dos le tocó.
    const esRed = /fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(mensaje);
    return error(
      'ERROR_INTERNO',
      esRed ? 'No hay conexión con Lucid Bot. Revisa el internet y vuelve a intentar.' : mensaje,
    );
  }
}
