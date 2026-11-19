/**
 * Fechas civiles (YYYY-MM-DD), sin hora y sin zona.
 *
 * Todo el dominio razona en días de calendario, no en instantes. Un frasco no
 * se acaba "el 3 de octubre a las 14:32 UTC": se acaba el 3 de octubre. Trabajar
 * con cadenas YYYY-MM-DD elimina de raíz el desfase por UTC en vez de parchearlo
 * con conversiones en cada operación.
 *
 * La zona horaria solo interviene en un punto: saber qué día es HOY en Colombia.
 */

export type FechaCivil = string; // 'YYYY-MM-DD'

export const ZONA_HORARIA = 'America/Bogota';

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MS_POR_DIA = 86_400_000;

export class ErrorFecha extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorFecha';
  }
}

export function esFechaCivil(valor: unknown): valor is FechaCivil {
  if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) return false;
  // Rechaza fechas sintácticamente válidas pero inexistentes (2026-02-30).
  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return (
    fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d
  );
}

function exigirFecha(valor: FechaCivil, campo = 'fecha'): FechaCivil {
  if (!esFechaCivil(valor)) throw new ErrorFecha(`${campo} inválida: "${valor}" (se espera YYYY-MM-DD)`);
  return valor;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Días transcurridos desde la época. Base de toda la aritmética de fechas. */
function aDiasEpoch(fecha: FechaCivil): number {
  const [a, m, d] = exigirFecha(fecha).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_POR_DIA);
}

function desdeDiasEpoch(dias: number): FechaCivil {
  const f = new Date(dias * MS_POR_DIA);
  return `${f.getUTCFullYear()}-${dosDigitos(f.getUTCMonth() + 1)}-${dosDigitos(f.getUTCDate())}`;
}

/** Suma (o resta, con n negativo) días de calendario. Cruza meses y años sin ayuda. */
export function sumarDias(fecha: FechaCivil, dias: number): FechaCivil {
  if (!Number.isFinite(dias)) throw new ErrorFecha(`Cantidad de días inválida: ${dias}`);
  return desdeDiasEpoch(aDiasEpoch(fecha) + Math.trunc(dias));
}

/** Días de `desde` a `hasta`. Positivo si `hasta` es posterior. */
export function diferenciaDias(desde: FechaCivil, hasta: FechaCivil): number {
  return aDiasEpoch(hasta) - aDiasEpoch(desde);
}

export function compararFechas(a: FechaCivil, b: FechaCivil): number {
  return aDiasEpoch(a) - aDiasEpoch(b);
}

export function maxFecha(a: FechaCivil, b: FechaCivil): FechaCivil {
  return compararFechas(a, b) >= 0 ? a : b;
}

export function minFecha(a: FechaCivil, b: FechaCivil): FechaCivil {
  return compararFechas(a, b) <= 0 ? a : b;
}

/** Qué día es hoy en Colombia, sin importar dónde corra el proceso. */
export function hoy(zona: string = ZONA_HORARIA, referencia: Date = new Date()): FechaCivil {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referencia);
  // en-CA formatea justamente como YYYY-MM-DD.
  return partes;
}

/**
 * Convierte a fecha civil lo que venga: un Date guardado por nosotros (siempre a
 * medianoche UTC), una cadena ISO, o un timestamp de Lucid Bot
 * ("2026-08-04 00:16:40"), que ya viene en hora local de la cuenta.
 */
export function aFechaCivil(valor: Date | string): FechaCivil {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new ErrorFecha('Date inválido');
    return `${valor.getUTCFullYear()}-${dosDigitos(valor.getUTCMonth() + 1)}-${dosDigitos(valor.getUTCDate())}`;
  }
  const recortada = valor.slice(0, 10);
  return exigirFecha(recortada, 'fecha de origen');
}

/**
 * Fecha civil a Date para guardar en la base: siempre medianoche UTC, de modo
 * que al releerla con aFechaCivil() se recupere exactamente el mismo día.
 */
export function aDate(fecha: FechaCivil): Date {
  return new Date(`${exigirFecha(fecha)}T00:00:00.000Z`);
}

/** Instante real (no fecha civil) para timestamps de auditoría y envíos. */
export function ahora(): Date {
  return new Date();
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** Formato corto para la interfaz: "3 oct 2026". */
export function formatearFecha(fecha: FechaCivil): string {
  const [a, m, d] = exigirFecha(fecha).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Lunes de la semana de una fecha. Base para la proyección semanal. */
export function inicioDeSemana(fecha: FechaCivil): FechaCivil {
  const dias = aDiasEpoch(fecha);
  // 1970-01-01 fue jueves; el desplazamiento deja el lunes como día 0.
  const diaSemana = (((dias + 3) % 7) + 7) % 7;
  return desdeDiasEpoch(dias - diaSemana);
}
