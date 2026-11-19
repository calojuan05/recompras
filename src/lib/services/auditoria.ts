/**
 * Registro de auditoría. Todo cambio de estado que no haya hecho una persona
 * a mano debe quedar explicado aquí: cuando una fecha sugerida se mueva sola,
 * tiene que haber forma de saber por qué.
 */

import { prisma } from '@/lib/db';

export interface EntradaAuditoria {
  entidad: string;
  entidadId: string;
  accion: string;
  antes?: unknown;
  despues?: unknown;
  actor?: string;
}

function serializar(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  try {
    return JSON.stringify(valor);
  } catch {
    return null;
  }
}

export async function auditar(entrada: EntradaAuditoria): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      accion: entrada.accion,
      payloadAntes: serializar(entrada.antes),
      payloadDespues: serializar(entrada.despues),
      actor: entrada.actor ?? 'sistema',
    },
  });
}

/** Varias entradas de golpe: el job diario genera cientos. */
export async function auditarLote(entradas: EntradaAuditoria[]): Promise<void> {
  if (entradas.length === 0) return;
  await prisma.auditLog.createMany({
    data: entradas.map((e) => ({
      entidad: e.entidad,
      entidadId: e.entidadId,
      accion: e.accion,
      payloadAntes: serializar(e.antes),
      payloadDespues: serializar(e.despues),
      actor: e.actor ?? 'sistema',
    })),
  });
}
