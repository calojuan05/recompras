import { leerJson, manejarError, ok } from '@/lib/http';
import { recalcularCiclos } from '@/lib/services/ciclos';
import { EsquemaRecalculo } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

/** Recálculo masivo. Sin filtros recorre toda la base. */
export async function POST(peticion: Request) {
  try {
    const filtros = EsquemaRecalculo.parse(await leerJson(peticion));
    const resultado = await recalcularCiclos({ ...filtros, actor: 'panel' });
    return ok(resultado);
  } catch (e) {
    return manejarError(e);
  }
}
