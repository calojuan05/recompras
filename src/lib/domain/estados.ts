/**
 * Estados de un ciclo y su reclasificación diaria.
 *
 * Tres estados los calcula el sistema a partir del calendario (PROGRAMADO,
 * POR_VENCER, VENCIDO) y tres los decide una persona (RECOMPRADO, PAUSADO,
 * CANCELADO). El job nocturno nunca pisa una decisión humana.
 */

import { compararFechas, type FechaCivil } from './fechas';

export const ESTADOS_CICLO = [
  'PROGRAMADO',
  'POR_VENCER',
  'VENCIDO',
  'CONTACTADO',
  'RECOMPRADO',
  'PAUSADO',
  'CANCELADO',
] as const;

export type EstadoCiclo = (typeof ESTADOS_CICLO)[number];

/** Estados que el motor puede mover solo. */
export const ESTADOS_AUTOMATICOS: readonly EstadoCiclo[] = ['PROGRAMADO', 'POR_VENCER', 'VENCIDO'];

/**
 * Estados fijados por una persona: el motor los respeta.
 *
 * CONTACTADO está aquí a propósito. Si el job pudiera reclasificarlo, la
 * siguiente corrida lo devolvería a POR_VENCER y la marca no habría servido de
 * nada. Lo único que lo saca de ahí es que el cliente vuelva a comprar: al
 * llegar una compra posterior, el ciclo pasa a RECOMPRADO solo.
 */
export const ESTADOS_MANUALES: readonly EstadoCiclo[] = [
  'CONTACTADO',
  'RECOMPRADO',
  'PAUSADO',
  'CANCELADO',
];

/**
 * Estados que cuentan como "ciclo vivo" en los KPIs. CONTACTADO cuenta: el
 * cliente sigue sin recomprar, solo que ya sabe que le escribimos.
 */
export const ESTADOS_ABIERTOS: readonly EstadoCiclo[] = [
  'PROGRAMADO',
  'POR_VENCER',
  'VENCIDO',
  'CONTACTADO',
];

export const ETIQUETA_ESTADO: Record<EstadoCiclo, string> = {
  PROGRAMADO: 'Programado',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
  CONTACTADO: 'Contactado',
  RECOMPRADO: 'Recomprado',
  PAUSADO: 'Pausado',
  CANCELADO: 'Cancelado',
};

export function esEstadoCiclo(valor: unknown): valor is EstadoCiclo {
  return typeof valor === 'string' && (ESTADOS_CICLO as readonly string[]).includes(valor);
}

export interface FechasCiclo {
  fechaRecompraSugerida: FechaCivil;
  fechaAgotamientoEstimada: FechaCivil;
}

/**
 * Estado que le corresponde a un ciclo hoy:
 *
 *   antes de la fecha sugerida ............ PROGRAMADO
 *   entre la sugerida y el agotamiento .... POR_VENCER  (ventana de contacto)
 *   pasado el agotamiento ................. VENCIDO     (ya se quedó sin producto)
 */
export function clasificarEstado(
  estadoActual: EstadoCiclo,
  fechas: FechasCiclo,
  hoy: FechaCivil,
): EstadoCiclo {
  if (ESTADOS_MANUALES.includes(estadoActual)) return estadoActual;
  if (compararFechas(hoy, fechas.fechaAgotamientoEstimada) > 0) return 'VENCIDO';
  if (compararFechas(hoy, fechas.fechaRecompraSugerida) >= 0) return 'POR_VENCER';
  return 'PROGRAMADO';
}

/** ¿El ciclo está dentro de la ventana en la que tiene sentido contactar? */
export function enVentanaDeContacto(estado: EstadoCiclo): boolean {
  return estado === 'POR_VENCER' || estado === 'VENCIDO';
}
