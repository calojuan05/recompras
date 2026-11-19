/**
 * Plantillas de mensaje.
 *
 * Sustitución simple de variables {{como_esta}}. Deliberadamente no hay lógica
 * condicional ni bucles: una plantilla que puede ramificar es una plantilla que
 * puede mandarle a un cliente una frase que nadie revisó.
 */

export const VARIABLES_DISPONIBLES = [
  'nombre',
  'producto',
  'dias_restantes',
  'link_recompra',
] as const;

export type VariablePlantilla = (typeof VARIABLES_DISPONIBLES)[number];

export type VariablesMensaje = Partial<Record<VariablePlantilla, string | number>> &
  Record<string, string | number | undefined>;

const PATRON_VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Sustituye las variables presentes y deja intactas las que no reconoce. */
export function renderizarPlantilla(cuerpo: string, variables: VariablesMensaje): string {
  return (cuerpo ?? '').replace(PATRON_VARIABLE, (original, clave: string) => {
    const valor = variables[clave];
    return valor === undefined || valor === null ? original : String(valor);
  });
}

/** Variables que la plantilla usa y para las que no hay dato. */
export function variablesFaltantes(cuerpo: string, variables: VariablesMensaje): string[] {
  const usadas = [...(cuerpo ?? '').matchAll(PATRON_VARIABLE)].map((m) => m[1]);
  return [...new Set(usadas)].filter(
    (clave) => variables[clave] === undefined || variables[clave] === null,
  );
}

/**
 * Cómo se lee "le quedan N días" cuando N ya es negativo. Decirle a alguien
 * que le quedan −3 días es la clase de detalle que hace ver amateur al sistema.
 */
export function describirDiasRestantes(dias: number): string {
  if (dias > 1) return `${dias} días`;
  if (dias === 1) return '1 día';
  if (dias === 0) return 'menos de un día';
  if (dias === -1) return 'se terminó ayer';
  return `se terminó hace ${Math.abs(dias)} días`;
}
