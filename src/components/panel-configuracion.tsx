'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Configuracion } from '@/lib/services/configuracion';

export function FormularioConfiguracion({ inicial }: { inicial: Configuracion }) {
  const router = useRouter();
  const [config, setConfig] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  const cambiado = JSON.stringify(config) !== JSON.stringify(inicial);

  const guardar = async () => {
    setGuardando(true);
    try {
      const respuesta = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(datos?.error?.message ?? 'No se pudo guardar.');
        return;
      }

      toast.success('Configuración guardada', {
        description: datos.recalculo
          ? `Se recalcularon ${datos.recalculo.ciclosActualizados} ciclos con las fechas nuevas.`
          : 'Las fechas de los ciclos no se vieron afectadas.',
        duration: 8000,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parámetros de operación</CardTitle>
        <CardDescription>
          Cambiar los días de anticipación recalcula todas las fechas sugeridas al guardar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="anticipacion">Días de anticipación</Label>
            <Input
              id="anticipacion"
              type="number"
              min={0}
              max={365}
              value={config.diasDeAnticipacion}
              onChange={(e) =>
                setConfig({ ...config, diasDeAnticipacion: Number(e.target.value) })
              }
            />
            <p className="text-muted-foreground text-xs">
              Cuántos días antes del agotamiento se sugiere la recompra.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="frecuencia">Días entre contactos</Label>
            <Input
              id="frecuencia"
              type="number"
              min={0}
              max={365}
              value={config.diasEntreContactos}
              onChange={(e) =>
                setConfig({ ...config, diasEntreContactos: Number(e.target.value) })
              }
            />
            <p className="text-muted-foreground text-xs">
              Nadie recibe dos mensajes en menos de este plazo. Bajarlo a cero es la forma
              más rápida de quemar la base.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="modo">Modo de envío</Label>
            <Select
              value={config.modoEnvio}
              onValueChange={(v) =>
                setConfig({ ...config, modoEnvio: v as Configuracion['modoEnvio'] })
              }
            >
              <SelectTrigger id="modo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simulado">Simulado (no sale nada)</SelectItem>
                <SelectItem value="real">Real (requiere credenciales)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              En simulado los mensajes se guardan en la bandeja y no llegan a ningún cliente.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="fuente">Fuente de datos</Label>
            <Select
              value={config.fuenteDatos}
              onValueChange={(v) =>
                setConfig({ ...config, fuenteDatos: v as Configuracion['fuenteDatos'] })
              }
            >
              <SelectTrigger id="fuente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lucidbot">Lucid Bot</SelectItem>
                <SelectItem value="local">Base local</SelectItem>
                <SelectItem value="csv">Importación CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="link">Enlace de recompra</Label>
            <Input
              id="link"
              value={config.linkRecompra}
              onChange={(e) => setConfig({ ...config, linkRecompra: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Es lo que reemplaza a <code>{'{{link_recompra}}'}</code> en las plantillas.
            </p>
          </div>
        </div>

        <div className="border-border flex items-start justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Solo las entregas arrancan un ciclo</p>
            <p className="text-muted-foreground mt-1 text-xs">
              En contraentrega un pedido en tránsito o devuelto nunca llegó a consumirse.
              Apagarlo hace que cualquier pedido cuente desde la fecha en que se hizo, y eso
              adelanta todos los avisos.
            </p>
          </div>
          <Switch
            checked={config.soloEntregados}
            onCheckedChange={(v) => setConfig({ ...config, soloEntregados: v })}
            aria-label="Solo las entregas arrancan un ciclo"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={!cambiado || guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PanelMotor({
  ultimaEjecucion,
  cronActivo,
  horario,
}: {
  ultimaEjecucion: string | null;
  cronActivo: boolean;
  horario: string;
}) {
  const router = useRouter();
  const [corriendo, setCorriendo] = useState(false);

  const ejecutar = async () => {
    setCorriendo(true);
    try {
      const respuesta = await fetch('/api/jobs/run', { method: 'POST' });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(datos?.error?.message ?? 'El job falló.');
        return;
      }

      const transiciones = Object.entries(datos.resumenTransiciones ?? {})
        .map(([cambio, cuantos]) => `${cuantos} ${cambio}`)
        .join(', ');

      toast.success(`Job ejecutado en ${(datos.duracionMs / 1000).toFixed(1)} s`, {
        description: [
          `${datos.ciclos.ciclosActualizados} ciclos revisados`,
          transiciones ? `cambios de estado: ${transiciones}` : 'ningún ciclo cambió de estado',
          `${datos.notificaciones.mensajesCreados} mensajes preparados`,
        ].join(' · '),
        duration: 10000,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setCorriendo(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Motor de programación</CardTitle>
        <CardDescription>
          {cronActivo
            ? `Corre solo todos los días (${horario}, hora de Bogotá) mientras la aplicación esté levantada.`
            : 'El cron está apagado: el job solo corre cuando lo dispares a mano.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Última ejecución:{' '}
          {ultimaEjecucion ? (
            <span className="text-foreground">{ultimaEjecucion}</span>
          ) : (
            'nunca'
          )}
        </p>
        <Button onClick={ejecutar} disabled={corriendo}>
          {corriendo ? 'Ejecutando...' : 'Ejecutar ahora'}
        </Button>
      </CardContent>
    </Card>
  );
}

export function PanelSincronizacion({ fuente }: { fuente: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<'prueba' | 'real' | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const sincronizar = async (dryRun: boolean) => {
    setOcupado(dryRun ? 'prueba' : 'real');
    setResultado(null);
    try {
      const respuesta = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(datos?.error?.message ?? 'La sincronización falló.');
        setResultado(datos?.error?.message ?? null);
        return;
      }

      const texto = [
        `Clientes: ${datos.clientesNuevos} nuevos, ${datos.clientesActualizados} actualizados`,
        `Compras: ${datos.comprasNuevas} nuevas, ${datos.comprasActualizadas} actualizadas`,
        `${datos.comprasEnRevision} pedidos necesitan revisión manual`,
        datos.ciclos
          ? `Ciclos: ${datos.ciclos.ciclosCreados} nuevos, ${datos.ciclos.ciclosActualizados} actualizados`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      setResultado(texto);
      toast.success(dryRun ? 'Prueba terminada (no se escribió nada)' : 'Sincronización terminada', {
        duration: 8000,
      });
      if (!dryRun) router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sincronización</CardTitle>
        <CardDescription>
          Trae pedidos y contactos desde <strong>{fuente}</strong>. Es idempotente: correrla
          dos veces no duplica nada. La primera vez tarda varios minutos porque pide cada
          contacto por separado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado !== null}
            onClick={() => sincronizar(true)}
          >
            {ocupado === 'prueba' ? 'Probando...' : 'Probar sin escribir'}
          </Button>
          <Button size="sm" disabled={ocupado !== null} onClick={() => sincronizar(false)}>
            {ocupado === 'real' ? 'Sincronizando...' : 'Sincronizar ahora'}
          </Button>
        </div>
        {resultado && (
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
            {resultado}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
