/**
 * Cálculo de un ciclo de recompra. Núcleo del sistema.
 *
 *   diasTotales           = duracionEstimadaDias × cantidadFrascos × factorAjuste
 *   fechaAgotamiento      = fechaInicio + diasTotales
 *   fechaRecompraSugerida = fechaAgotamiento − diasDeAnticipacion
 *
 * Dos reglas que no son obvias:
 *
 * 1. Varios frascos en una misma orden se SUMAN. El cliente no se toma tres
 *    frascos en paralelo: se toma uno, luego otro, luego otro.
 * 2. Si vuelve a comprar antes de agotar lo que tiene, el frasco nuevo no
 *    empieza a consumirse el día de la compra sino cuando se acabe el anterior.
 *    Ignorar esto adelanta cada aviso y termina hostigando al cliente.
 */

import { ErrorDominio } from './duracion';
import { acotarFactor, FACTOR_NEUTRO } from './factor-ajuste';
import {
  compararFechas,
  diferenciaDias,
  esFechaCivil,
  sumarDias,
  type FechaCivil,
} from './fechas';

export interface EntradaCiclo {
  /** En contraentrega, la fecha de ENTREGA: es cuando empieza el consumo real. */
  fechaCompra: FechaCivil;
  duracionEstimadaDias: number;
  cantidadFrascos: number;
  factorAjuste?: number;
  diasDeAnticipacion: number;
  /** Agotamiento del ciclo vigente del mismo cliente y producto, si lo hay. */
  fechaAgotamientoCicloPrevio?: FechaCivil | null;
}

export interface CicloCalculado {
  fechaInicio: FechaCivil;
  fechaAgotamientoEstimada: FechaCivil;
  fechaRecompraSugerida: FechaCivil;
  diasTotales: number;
  factorAjusteAplicado: number;
  /** true si el ciclo arrancó donde terminaba el anterior, no en la fecha de compra. */
  encadenado: boolean;
}

export function calcularCiclo(entrada: EntradaCiclo): CicloCalculado {
  const {
    fechaCompra,
    duracionEstimadaDias,
    cantidadFrascos,
    diasDeAnticipacion,
    fechaAgotamientoCicloPrevio = null,
  } = entrada;

  if (!esFechaCivil(fechaCompra)) {
    throw new ErrorDominio(`Fecha de compra inválida: "${fechaCompra}"`);
  }
  if (!Number.isFinite(duracionEstimadaDias) || duracionEstimadaDias < 1) {
    throw new ErrorDominio('La duración estimada del producto debe ser de al menos un día.');
  }
  if (!Number.isInteger(cantidadFrascos) || cantidadFrascos < 1) {
    throw new ErrorDominio('La cantidad de frascos debe ser un entero mayor o igual a uno.');
  }
  if (!Number.isInteger(diasDeAnticipacion) || diasDeAnticipacion < 0) {
    throw new ErrorDominio('Los días de anticipación deben ser un entero mayor o igual a cero.');
  }

  const factorAjusteAplicado = acotarFactor(entrada.factorAjuste ?? FACTOR_NEUTRO);

  // Al menos un día: un factor bajo sobre un frasco corto no puede dar cero.
  const diasTotales = Math.max(
    1,
    Math.floor(duracionEstimadaDias * cantidadFrascos * factorAjusteAplicado),
  );

  const encadenado =
    !!fechaAgotamientoCicloPrevio &&
    esFechaCivil(fechaAgotamientoCicloPrevio) &&
    compararFechas(fechaAgotamientoCicloPrevio, fechaCompra) > 0;

  const fechaInicio = encadenado ? (fechaAgotamientoCicloPrevio as FechaCivil) : fechaCompra;
  const fechaAgotamientoEstimada = sumarDias(fechaInicio, diasTotales);

  // Si la anticipación es mayor que lo que dura el frasco, avisar antes de
  // empezar no tiene sentido: el aviso se ancla al inicio del ciclo.
  const sugerida = sumarDias(fechaAgotamientoEstimada, -diasDeAnticipacion);
  const fechaRecompraSugerida =
    compararFechas(sugerida, fechaInicio) < 0 ? fechaInicio : sugerida;

  return {
    fechaInicio,
    fechaAgotamientoEstimada,
    fechaRecompraSugerida,
    diasTotales,
    factorAjusteAplicado,
    encadenado,
  };
}

/** Días que le quedan de producto. Negativo si ya se le acabó. */
export function diasRestantes(
  fechaAgotamientoEstimada: FechaCivil,
  hoy: FechaCivil,
): number {
  return diferenciaDias(hoy, fechaAgotamientoEstimada);
}

/** Porcentaje de frasco que le queda, 0–100. Alimenta la barra de la ficha del cliente. */
export function porcentajeRestante(
  fechaInicio: FechaCivil,
  fechaAgotamientoEstimada: FechaCivil,
  hoy: FechaCivil,
): number {
  const total = diferenciaDias(fechaInicio, fechaAgotamientoEstimada);
  if (total <= 0) return 0;
  const restante = diferenciaDias(hoy, fechaAgotamientoEstimada);
  const porcentaje = (restante / total) * 100;
  return Math.min(100, Math.max(0, Math.round(porcentaje)));
}
