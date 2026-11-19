import { aDate, aFechaCivil, compararFechas, sumarDias } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { error, leerJson, manejarError, ok } from '@/lib/http';
import { auditar } from '@/lib/services/auditoria';
import { EsquemaCicloParcial } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/** Pausar, cancelar, marcar recomprado o mover la fecha sugerida. */
export async function PATCH(peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const cambios = EsquemaCicloParcial.parse(await leerJson(peticion));

    const antes = await prisma.repurchaseCycle.findUnique({ where: { id } });
    if (!antes) return error('NO_ENCONTRADO', 'Ese ciclo no existe.');

    if (cambios.fechaRecompraSugerida) {
      const agotamiento = aFechaCivil(antes.fechaAgotamientoEstimada);
      if (compararFechas(cambios.fechaRecompraSugerida, agotamiento) > 0) {
        return error(
          'REGLA_DE_NEGOCIO',
          'La fecha sugerida no puede ser posterior al agotamiento: avisar después de que se le acabó no sirve de nada.',
          { fechaAgotamiento: agotamiento },
        );
      }
    }

    // Mover los días de anticipación recoloca la fecha sugerida del ciclo.
    const fechaPorAnticipacion =
      cambios.diasDeAnticipacion !== undefined && !cambios.fechaRecompraSugerida
        ? sumarDias(aFechaCivil(antes.fechaAgotamientoEstimada), -cambios.diasDeAnticipacion)
        : null;

    const ciclo = await prisma.repurchaseCycle.update({
      where: { id },
      data: {
        ...(cambios.estado ? { estado: cambios.estado } : {}),
        ...(cambios.diasDeAnticipacion !== undefined
          ? { diasDeAnticipacion: cambios.diasDeAnticipacion }
          : {}),
        ...(cambios.notas !== undefined ? { notas: cambios.notas } : {}),
        ...(cambios.fechaRecompraSugerida
          ? { fechaRecompraSugerida: aDate(cambios.fechaRecompraSugerida) }
          : fechaPorAnticipacion
            ? { fechaRecompraSugerida: aDate(fechaPorAnticipacion) }
            : {}),
        ...(cambios.estado === 'RECOMPRADO' && !antes.convertidoAt
          ? { convertidoAt: new Date() }
          : {}),
        // Marcarlo contactado es un contacto real: cuenta para el límite de
        // frecuencia igual que si lo hubiera despachado la bandeja.
        ...(cambios.estado === 'CONTACTADO'
          ? { ultimoContactoAt: new Date(), intentosContacto: { increment: 1 } }
          : {}),
      },
    });

    await auditar({
      entidad: 'RepurchaseCycle',
      entidadId: id,
      accion: 'actualizacion_manual',
      antes: {
        estado: antes.estado,
        fechaRecompraSugerida: aFechaCivil(antes.fechaRecompraSugerida),
        diasDeAnticipacion: antes.diasDeAnticipacion,
      },
      despues: {
        estado: ciclo.estado,
        fechaRecompraSugerida: aFechaCivil(ciclo.fechaRecompraSugerida),
        diasDeAnticipacion: ciclo.diasDeAnticipacion,
        intentosContacto: ciclo.intentosContacto,
      },
      actor: 'panel',
    });

    return ok({
      ...ciclo,
      fechaInicio: aFechaCivil(ciclo.fechaInicio),
      fechaAgotamientoEstimada: aFechaCivil(ciclo.fechaAgotamientoEstimada),
      fechaRecompraSugerida: aFechaCivil(ciclo.fechaRecompraSugerida),
    });
  } catch (e) {
    return manejarError(e);
  }
}
