/**
 * El motor: lo que corre solo cada día a las 08:00 de Bogotá.
 *
 *   1. Recalcula los ciclos y reclasifica sus estados.
 *   2. Prepara los mensajes de los que entraron en ventana.
 *   3. Deja constancia de todo en la auditoría.
 *
 * No despacha nada: los mensajes quedan pendientes de aprobación humana. Un
 * sistema que escribe solo a los clientes mientras nadie mira es un accidente
 * esperando a ocurrir.
 */

import { hoy as hoyEnBogota } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { auditar, auditarLote } from '@/lib/services/auditoria';
import { recalcularCiclos, type ResultadoRecalculo } from '@/lib/services/ciclos';
import { generarNotificaciones, type ResumenGeneracion } from '@/lib/services/notificaciones';

export interface TransicionEstado {
  cicloId: string;
  antes: string;
  despues: string;
}

export interface ResumenJob {
  ejecutadoEn: string;
  dia: string;
  duracionMs: number;
  ciclos: ResultadoRecalculo;
  transiciones: TransicionEstado[];
  resumenTransiciones: Record<string, number>;
  notificaciones: ResumenGeneracion;
}

export async function ejecutarJobDiario(actor = 'cron'): Promise<ResumenJob> {
  const inicio = Date.now();
  const dia = hoyEnBogota();

  const antes = await prisma.repurchaseCycle.findMany({ select: { id: true, estado: true } });
  const mapaAntes = new Map(antes.map((c) => [c.id, c.estado]));

  const ciclos = await recalcularCiclos({ actor });

  const despues = await prisma.repurchaseCycle.findMany({ select: { id: true, estado: true } });

  const transiciones: TransicionEstado[] = [];
  for (const ciclo of despues) {
    const estadoAnterior = mapaAntes.get(ciclo.id);
    if (estadoAnterior && estadoAnterior !== ciclo.estado) {
      transiciones.push({ cicloId: ciclo.id, antes: estadoAnterior, despues: ciclo.estado });
    }
  }

  const resumenTransiciones: Record<string, number> = {};
  for (const t of transiciones) {
    const clave = `${t.antes} -> ${t.despues}`;
    resumenTransiciones[clave] = (resumenTransiciones[clave] ?? 0) + 1;
  }

  await auditarLote(
    transiciones.map((t) => ({
      entidad: 'RepurchaseCycle',
      entidadId: t.cicloId,
      accion: 'cambio_estado',
      antes: { estado: t.antes },
      despues: { estado: t.despues },
      actor,
    })),
  );

  const notificaciones = await generarNotificaciones({ actor });

  const resumen: ResumenJob = {
    ejecutadoEn: new Date().toISOString(),
    dia,
    duracionMs: Date.now() - inicio,
    ciclos,
    transiciones,
    resumenTransiciones,
    notificaciones,
  };

  await auditar({
    entidad: 'Job',
    entidadId: 'diario',
    accion: 'ejecucion',
    despues: {
      ...resumen,
      // La lista completa de transiciones ya quedó fila por fila arriba.
      transiciones: transiciones.length,
    },
    actor,
  });

  return resumen;
}

/** Última ejecución registrada, para mostrarla en Configuración. */
export async function ultimaEjecucion() {
  return prisma.auditLog.findFirst({
    where: { entidad: 'Job', entidadId: 'diario' },
    orderBy: { creadoEn: 'desc' },
  });
}
