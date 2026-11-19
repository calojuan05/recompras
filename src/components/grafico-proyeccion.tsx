'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { PuntoProyeccion } from '@/lib/services/metricas';
import { pesos } from '@/lib/formato';

export function GraficoProyeccion({ datos }: { datos: PuntoProyeccion[] }) {
  const vacio = datos.every((d) => d.ciclos === 0);

  if (vacio) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
        No hay recompras proyectadas en las próximas doce semanas.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="etiqueta"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
            formatter={(valor, nombre) =>
              nombre === 'valorEstimado'
                ? [pesos(Number(valor)), 'Valor estimado']
                : [String(valor), 'Recompras']
            }
            labelFormatter={(etiqueta) => `Semana del ${etiqueta}`}
          />
          <Bar dataKey="ciclos" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
