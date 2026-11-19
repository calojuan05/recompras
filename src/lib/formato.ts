/** Formateo para la interfaz: pesos colombianos y textos cortos. */

const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const NUMERO = new Intl.NumberFormat('es-CO');

export function pesos(valor: number): string {
  return PESOS.format(Math.round(valor || 0));
}

/** Versión compacta para tarjetas de KPI: $1,9 M. */
export function pesosCortos(valor: number): string {
  const v = Math.round(valor || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)} K`;
  return PESOS.format(v);
}

export function numero(valor: number): string {
  return NUMERO.format(valor || 0);
}

export function porcentaje(fraccion: number): string {
  return `${Math.round((fraccion || 0) * 100)} %`;
}

export function fechaHora(valor: Date | string | null | undefined): string {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(d);
}

export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
