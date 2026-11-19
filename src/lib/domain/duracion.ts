/**
 * Duración de un envase: cuántos días rinde un frasco.
 *
 * El catálogo mezcla unidades (cápsulas, gramos de colágeno en polvo, ml), pero
 * la cuenta es la misma en todas: contenido dividido dosis diaria.
 */

export type UnidadMedida = 'capsulas' | 'gramos' | 'ml' | 'sobres';

export const UNIDADES_MEDIDA: readonly UnidadMedida[] = ['capsulas', 'gramos', 'ml', 'sobres'];

export const ETIQUETA_UNIDAD: Record<UnidadMedida, string> = {
  capsulas: 'cápsulas',
  gramos: 'gramos',
  ml: 'ml',
  sobres: 'sobres',
};

export class ErrorDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}

/**
 * duracionEstimadaDias = floor(unidadesPorFrasco / dosisDiariaSugerida)
 *
 * Se redondea hacia abajo a propósito: es preferible avisar un día antes que un
 * día tarde. Un frasco que rinde 49,8 días se trata como 49.
 */
export function duracionEstimadaDias(
  unidadesPorFrasco: number,
  dosisDiariaSugerida: number,
): number {
  if (!Number.isFinite(unidadesPorFrasco) || unidadesPorFrasco <= 0) {
    throw new ErrorDominio('Las unidades por frasco deben ser un número mayor que cero.');
  }
  if (!Number.isFinite(dosisDiariaSugerida) || dosisDiariaSugerida <= 0) {
    throw new ErrorDominio('La dosis diaria sugerida debe ser un número mayor que cero.');
  }
  const dias = Math.floor(unidadesPorFrasco / dosisDiariaSugerida);
  if (dias < 1) {
    throw new ErrorDominio(
      'El frasco no alcanza para un día completo: revisa las unidades y la dosis.',
    );
  }
  return dias;
}

/** Texto explicativo para la ficha de producto: "500 gramos ÷ 10 al día = 50 días". */
export function explicarDuracion(
  unidadesPorFrasco: number,
  dosisDiariaSugerida: number,
  unidad: UnidadMedida,
): string {
  const dias = duracionEstimadaDias(unidadesPorFrasco, dosisDiariaSugerida);
  const etiqueta = ETIQUETA_UNIDAD[unidad] ?? unidad;
  return `${unidadesPorFrasco} ${etiqueta} ÷ ${dosisDiariaSugerida} al día = ${dias} días`;
}
