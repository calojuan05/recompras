import { ETIQUETA_ESTADO, type EstadoCiclo } from '@/lib/domain';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';

const COLOR_ESTADO: Record<string, string> = {
  PROGRAMADO: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  POR_VENCER: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  VENCIDO: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  CONTACTADO: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  RECOMPRADO: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  PAUSADO: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  CANCELADO: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', COLOR_ESTADO[estado] ?? '')}>
      {ETIQUETA_ESTADO[estado as EstadoCiclo] ?? estado}
    </Badge>
  );
}

/** Barra de producto restante. Cambia de color según lo que quede. */
export function BarraRestante({
  porcentaje,
  dias,
}: {
  porcentaje: number;
  dias: number;
}) {
  const color =
    dias < 0
      ? 'bg-red-500'
      : porcentaje <= 15
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-20 shrink-0 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.max(porcentaje, dias < 0 ? 100 : 2)}%` }}
        />
      </div>
      <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
        {dias < 0 ? `hace ${Math.abs(dias)} d` : `${dias} d`}
      </span>
    </div>
  );
}

export function Vacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="border-border flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{titulo}</p>
      <p className="text-muted-foreground max-w-md text-sm">{descripcion}</p>
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion ? (
          <p className="text-muted-foreground mt-1 text-sm">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap gap-2">{acciones}</div> : null}
    </div>
  );
}
