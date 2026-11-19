'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VARIABLES_DISPONIBLES } from '@/lib/domain';

export function AccionesMensajeria({ modoEnvio }: { modoEnvio: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<'generar' | 'despachar' | null>(null);

  const llamar = async (
    accion: 'generar' | 'despachar',
    ruta: string,
    cuerpo: Record<string, unknown>,
  ) => {
    setOcupado(accion);
    try {
      const respuesta = await fetch(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(datos?.error?.message ?? 'La operación falló.');
        return;
      }

      if (accion === 'generar') {
        const omitidos =
          datos.omitidosSinConsentimiento +
          datos.omitidosPorFrecuencia +
          datos.omitidosPorDuplicado +
          datos.omitidosSinDestinatario;
        toast.success(`${datos.mensajesCreados} mensajes preparados`, {
          description:
            omitidos > 0
              ? `${omitidos} ciclos se omitieron: ${datos.omitidosSinConsentimiento} sin consentimiento, ${datos.omitidosPorFrecuencia} contactados hace poco, ${datos.omitidosPorDuplicado} ya tenían uno pendiente, ${datos.omitidosSinDestinatario} sin canal.`
              : 'Ningún ciclo quedó fuera.',
          duration: 9000,
        });
      } else {
        toast.success(`${datos.procesados} mensajes procesados`, {
          description:
            datos.modo === 'simulado'
              ? `${datos.simulados} quedaron marcados como SIMULADO. No salió nada hacia ningún cliente.`
              : `${datos.enviados} enviados, ${datos.fallidos} fallidos.`,
          duration: 9000,
        });
      }

      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={ocupado !== null}
        onClick={() => llamar('generar', '/api/notifications/generate', {})}
      >
        {ocupado === 'generar' ? 'Preparando...' : 'Preparar mensajes'}
      </Button>
      <Button
        size="sm"
        disabled={ocupado !== null}
        onClick={() => llamar('despachar', '/api/notifications/dispatch', { limite: 100 })}
      >
        {ocupado === 'despachar'
          ? 'Procesando...'
          : modoEnvio === 'simulado'
            ? 'Procesar en modo simulado'
            : 'Enviar de verdad'}
      </Button>
    </div>
  );
}

export interface PlantillaEditable {
  id: string;
  nombre: string;
  canal: string;
  asunto: string | null;
  cuerpo: string;
  activo: boolean;
}

export function EditorPlantilla({ plantilla }: { plantilla: PlantillaEditable }) {
  const router = useRouter();
  const [cuerpo, setCuerpo] = useState(plantilla.cuerpo);
  const [asunto, setAsunto] = useState(plantilla.asunto ?? '');
  const [guardando, setGuardando] = useState(false);

  const cambiado = cuerpo !== plantilla.cuerpo || asunto !== (plantilla.asunto ?? '');

  const guardar = async () => {
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/templates/${plantilla.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuerpo, asunto: asunto || null }),
      });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(datos?.error?.message ?? 'No se pudo guardar la plantilla.');
        return;
      }

      toast.success(`Plantilla "${plantilla.nombre}" guardada`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setGuardando(false);
    }
  };

  // Vista previa con datos de muestra: lo que vería un cliente.
  const previa = cuerpo
    .replace(/\{\{\s*nombre\s*\}\}/g, 'Luz')
    .replace(/\{\{\s*producto\s*\}\}/g, 'Colágeno NeoCell 500 g')
    .replace(/\{\{\s*dias_restantes\s*\}\}/g, '7 días')
    .replace(/\{\{\s*link_recompra\s*\}\}/g, 'https://vico.com.co');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{plantilla.nombre}</CardTitle>
        <CardDescription className="text-xs">
          Canal {plantilla.canal} · variables: {VARIABLES_DISPONIBLES.map((v) => `{{${v}}}`).join(' ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {plantilla.canal === 'email' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`asunto-${plantilla.id}`} className="text-xs">
              Asunto
            </Label>
            <Input
              id={`asunto-${plantilla.id}`}
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
            />
          </div>
        )}

        <Textarea
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          rows={4}
          className="text-sm"
          aria-label={`Cuerpo de ${plantilla.nombre}`}
        />

        <div className="bg-muted rounded-md p-3">
          <p className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
            Así lo lee el cliente
          </p>
          <p className="text-sm whitespace-pre-wrap">{previa}</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            Sin promesas de resultados de salud: son suplementos, no medicamentos.
          </p>
          <Button size="sm" onClick={guardar} disabled={!cambiado || guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
