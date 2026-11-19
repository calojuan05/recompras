/**
 * Factor de ajuste por cliente.
 *
 * La duración teórica del frasco casi nunca coincide con el consumo real: hay
 * quien se salta días y quien dobla la dosis. Cuando un cliente ya ha comprado
 * el mismo producto dos o más veces, sus propios intervalos entre compras dicen
 * la verdad mejor que la etiqueta del envase.
 *
 * factor = mediana( intervalo_real_i / duracion_teorica_de_esa_compra_i )
 *
 * Se usa la mediana y no el promedio porque un solo pedido raro (una recompra a
 * los tres días por regalo, un cliente que desapareció medio año) desplazaría la
 * media lo suficiente para arruinar todas las fechas siguientes.
 */

import { diferenciaDias, type FechaCivil } from './fechas';

/** Límites de seguridad: ni el cliente más rápido ni el más lento se salen de aquí. */
export const FACTOR_MINIMO = 0.6;
export const FACTOR_MAXIMO = 1.6;
export const FACTOR_NEUTRO = 1.0;

/** Con una sola compra no hay intervalo que medir. */
export const COMPRAS_MINIMAS = 2;

export interface CompraHistorica {
  fechaCompra: FechaCivil;
  cantidadFrascos: number;
}

export interface ResultadoFactor {
  factor: number;
  /** Razones intervalo/duración antes de acotar; sirve para explicarlo en la ficha. */
  razones: number[];
  medianaCruda: number | null;
  suficienteHistorial: boolean;
  /** true si la mediana se salió del rango y hubo que acotarla. */
  acotado: boolean;
}

export function acotarFactor(factor: number): number {
  if (!Number.isFinite(factor)) return FACTOR_NEUTRO;
  return Math.min(FACTOR_MAXIMO, Math.max(FACTOR_MINIMO, factor));
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
}

export function calcularFactorAjuste(
  compras: CompraHistorica[],
  duracionEstimadaDias: number,
): ResultadoFactor {
  const neutro: ResultadoFactor = {
    factor: FACTOR_NEUTRO,
    razones: [],
    medianaCruda: null,
    suficienteHistorial: false,
    acotado: false,
  };

  if (compras.length < COMPRAS_MINIMAS || duracionEstimadaDias <= 0) return neutro;

  const orden = [...compras].sort((a, b) => a.fechaCompra.localeCompare(b.fechaCompra));

  const razones: number[] = [];
  for (let i = 1; i < orden.length; i++) {
    const anterior = orden[i - 1];
    const intervalo = diferenciaDias(anterior.fechaCompra, orden[i].fechaCompra);
    // Dos pedidos el mismo día son un pedido partido, no un ciclo de consumo.
    if (intervalo <= 0) continue;
    const frascos = Math.max(1, anterior.cantidadFrascos);
    const teorica = duracionEstimadaDias * frascos;
    if (teorica <= 0) continue;
    razones.push(intervalo / teorica);
  }

  const cruda = mediana(razones);
  if (cruda === null) return neutro;

  const factor = acotarFactor(cruda);
  return {
    factor,
    razones,
    medianaCruda: cruda,
    suficienteHistorial: true,
    acotado: factor !== cruda,
  };
}
