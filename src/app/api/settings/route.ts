import { leerJson, manejarError, ok } from '@/lib/http';
import { auditar } from '@/lib/services/auditoria';
import { recalcularCiclos } from '@/lib/services/ciclos';
import { guardarConfiguracion, leerConfiguracion } from '@/lib/services/configuracion';
import { EsquemaConfiguracion } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  try {
    return ok(await leerConfiguracion());
  } catch (e) {
    return manejarError(e);
  }
}

export async function PATCH(peticion: Request) {
  try {
    const cambios = EsquemaConfiguracion.parse(await leerJson(peticion));
    const antes = await leerConfiguracion();
    const config = await guardarConfiguracion(cambios);

    await auditar({
      entidad: 'Setting',
      entidadId: 'global',
      accion: 'actualizacion',
      antes,
      despues: config,
      actor: 'panel',
    });

    // Cambiar la anticipación mueve todas las fechas sugeridas: se recalcula
    // en el acto para que el panel no muestre datos viejos.
    const afectaFechas =
      antes.diasDeAnticipacion !== config.diasDeAnticipacion ||
      antes.soloEntregados !== config.soloEntregados;

    const recalculo = afectaFechas ? await recalcularCiclos({ actor: 'panel' }) : null;

    return ok({ configuracion: config, recalculo });
  } catch (e) {
    return manejarError(e);
  }
}
