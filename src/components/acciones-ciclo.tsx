'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ACCIONES = [
  { valor: 'CONTACTADO', etiqueta: 'Marcar contactado' },
  { valor: 'RECOMPRADO', etiqueta: 'Marcar recomprado' },
  { valor: 'PAUSADO', etiqueta: 'Pausar' },
  { valor: 'CANCELADO', etiqueta: 'Cancelar' },
  { valor: 'PROGRAMADO', etiqueta: 'Reactivar' },
];

const DESCRIPCION_ACCION: Record<string, string> = {
  CONTACTADO:
    'Queda fuera de la lista de pendientes y no se le generan más mensajes. Vuelve solo si el cliente compra otra vez.',
  PAUSADO: 'El motor ya no lo va a mover ni le va a generar mensajes.',
  CANCELADO: 'El motor ya no lo va a mover ni le va a generar mensajes.',
  PROGRAMADO: 'Vuelve a quedar bajo el control del motor.',
};

export function AccionesCiclo({ cicloId, estado }: { cicloId: string; estado: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  const cambiar = async (nuevoEstado: string) => {
    setEnviando(true);
    try {
      const respuesta = await fetch(`/api/cycles/${cicloId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(cuerpo?.error?.message ?? 'No se pudo cambiar el estado.');
        return;
      }

      toast.success(
        nuevoEstado === 'CONTACTADO' ? 'Marcado como contactado' : 'Ciclo actualizado',
        { description: DESCRIPCION_ACCION[nuevoEstado] },
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Select
      value=""
      onValueChange={(v) => {
        if (v) void cambiar(v);
      }}
      disabled={enviando}
    >
      <SelectTrigger size="sm" className="w-36" aria-label="Acciones del ciclo">
        <SelectValue placeholder="Acciones" />
      </SelectTrigger>
      <SelectContent>
        {ACCIONES.filter((a) => a.valor !== estado).map((a) => (
          <SelectItem key={a.valor} value={a.valor}>
            {a.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Recálculo masivo desde la cabecera de la pantalla de ciclos. */
export function BotonRecalcular() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  const recalcular = async () => {
    setEnviando(true);
    try {
      const respuesta = await fetch('/api/cycles/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(cuerpo?.error?.message ?? 'No se pudo recalcular.');
        return;
      }

      toast.success('Ciclos recalculados', {
        description: `${cuerpo.ciclosActualizados} actualizados, ${cuerpo.ciclosCreados} nuevos, ${cuerpo.comprasSinCiclo} compras sin ciclo.`,
        duration: 7000,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={recalcular} disabled={enviando}>
      {enviando ? 'Recalculando...' : 'Recalcular todo'}
    </Button>
  );
}
