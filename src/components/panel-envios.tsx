'use client';

/**
 * Vigilancia de envíos a San Andrés y Providencia.
 *
 * La pantalla está ordenada por lo único que importa aquí: cuánto lleva
 * esperando el cliente. Lo que pasó de siete días va primero y en rojo, porque
 * ese es el punto en el que un paquete deja de estar "en camino" y empieza a
 * estar "a punto de devolverse".
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EnvioEnPantalla } from '@/lib/services/envios';

const pesos = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

/** El número de WhatsApp listo para wa.me: solo dígitos, con indicativo. */
function aWhatsapp(telefono: string | null): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = '57' + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

function mensajePara(e: EnvioEnPantalla): string {
  const nombre = e.nombre.trim().split(/\s+/)[0] || '';
  return `Hola${nombre ? ` ${nombre}` : ''}, te escribimos de VicoVital 😊 Tu pedido salió hace ${e.dias} días y todavía aparece sin entregar. ¿Ya te llegó el aviso de la transportadora? Si está en oficina, cuéntame y te paso los datos para que lo reclames antes de que lo devuelvan.`;
}

export function PanelEnvios({ envios, diasLimite }: { envios: EnvioEnPantalla[]; diasLimite: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  const enRiesgo = envios.filter((e) => e.enRiesgo);
  const enCurso = envios.filter((e) => !e.resuelto && !e.enRiesgo);
  const devueltos = envios.filter((e) => e.resuelto === 'devuelto');
  const entregados = envios.filter((e) => e.resuelto === 'entregado');

  const actualizar = async () => {
    setOcupado(true);
    try {
      const r = await fetch('/api/envios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sin fecha, el servidor usa el mes en curso.
        body: JSON.stringify({}),
      });
      const datos = await r.json();
      if (!r.ok) {
        toast.error(datos?.error?.message ?? 'No se pudo actualizar.');
        return;
      }
      toast.success('Estados actualizados', {
        description: [
          `${datos.delMes} pedidos del mes revisados`,
          `${datos.deLasIslas} de las islas`,
          datos.nuevos ? `${datos.nuevos} nuevos` : null,
          datos.presupuestoAgotado
            ? `quedaron ${datos.pendientesDeMirar} sin mirar: vuelve a darle para seguir`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        duration: 12000,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setOcupado(false);
    }
  };

  /** El recordatorio para uno mismo, con la lista de quién sigue esperando. */
  const resumenParaMi = () => {
    const lineas = enRiesgo.map(
      (e) => `• ${e.nombre} (${e.ciudad ?? 'isla'}) — ${e.dias} días, ${e.etapa}`,
    );
    return `Pedidos de San Andrés sin entregar:\n\n${lineas.join('\n')}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Pasaron {diasLimite} días</p>
            <p className={`mt-1 text-3xl font-semibold ${enRiesgo.length > 0 ? 'text-destructive' : ''}`}>
              {enRiesgo.length}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">sin entregar todavía</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">En camino</p>
            <p className="mt-1 text-3xl font-semibold">{enCurso.length}</p>
            <p className="text-muted-foreground mt-1 text-xs">dentro del plazo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Entregados</p>
            <p className="mt-1 text-3xl font-semibold">{entregados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Devueltos</p>
            <p className="mt-1 text-3xl font-semibold">{devueltos.length}</p>
            <p className="text-muted-foreground mt-1 text-xs">ya no hay nada que hacer</p>
          </CardContent>
        </Card>
      </div>

      {enRiesgo.length > 0 && (
        <Card className="border-destructive border-2">
          <CardHeader>
            <CardTitle className="text-base">
              {enRiesgo.length === 1
                ? '1 persona lleva más de una semana esperando'
                : `${enRiesgo.length} personas llevan más de una semana esperando`}
            </CardTitle>
            <CardDescription>
              Su pedido salió hace {diasLimite} días o más y sigue sin entregarse. Escribirles ahora
              es lo que evita que el paquete se devuelva.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {enRiesgo.map((e) => {
              const wa = aWhatsapp(e.telefono);
              return (
                <div
                  key={e.id}
                  className="bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-medium">{e.nombre}</span>
                  <span className="text-muted-foreground">{e.ciudad ?? '—'}</span>
                  <span className="text-destructive font-medium">{e.dias} días</span>
                  <span className="text-muted-foreground">{e.etapa}</span>
                  {wa && (
                    <a
                      className="bg-primary text-primary-foreground ml-auto rounded-md px-3 py-1.5 text-xs font-medium"
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(mensajePara(e))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Escribirle
                    </a>
                  )}
                </div>
              );
            })}

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(resumenParaMi()).then(
                    () => toast.success('Resumen copiado: pégalo donde lo necesites'),
                    () => toast.error('No se pudo copiar'),
                  );
                }}
              >
                Copiar resumen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Envíos a San Andrés y Providencia</CardTitle>
            <CardDescription>
              Desde septiembre. El contador arranca cuando se genera la guía y se detiene cuando el
              pedido aparece como entregado.
            </CardDescription>
          </div>
          <Button size="sm" onClick={actualizar} disabled={ocupado}>
            {ocupado ? 'Consultando…' : 'Actualizar estados'}
          </Button>
        </CardHeader>
        <CardContent>
          {envios.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Todavía no hay envíos vigilados. Dale a «Actualizar estados» para traerlos de Lucid Bot.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Guía</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {envios.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.nombre}
                      {e.telefono && (
                        <span className="text-muted-foreground block font-mono text-xs">
                          {e.telefono}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {e.ciudad ?? '—'}
                      {e.direccion && <span className="block text-xs">{e.direccion}</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.producto ?? '—'}
                      <span className="text-muted-foreground block text-xs">{pesos(e.valor)}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{e.fechaGuia}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${e.enRiesgo ? 'text-destructive font-semibold' : ''}`}
                    >
                      {e.dias}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.resuelto === 'entregado' ? (
                        <span className="text-muted-foreground">Entregado</span>
                      ) : e.resuelto === 'devuelto' ? (
                        <span className="text-destructive">Devuelto</span>
                      ) : (
                        e.etapa
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
