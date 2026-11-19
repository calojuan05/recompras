import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BotonWhatsapp } from '@/components/boton-whatsapp';
import { BarraRestante, Encabezado, EstadoBadge, Vacio } from '@/components/comunes';
import { NuevaCompra } from '@/components/nueva-compra';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  aFechaCivil,
  diasRestantes,
  ESTADOS_ABIERTOS,
  formatearFecha,
  hoy as hoyEnBogota,
  porcentajeRestante,
  type EstadoCiclo,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { pesos } from '@/lib/formato';
import { leerConfiguracion } from '@/lib/services/configuracion';
import { redactarMensaje } from '@/lib/services/notificaciones';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FichaCliente({ params }: Props) {
  const { id } = await params;

  const [cliente, productos, plantillas, config] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        compras: {
          include: { product: { select: { nombre: true } } },
          orderBy: { fechaCompra: 'desc' },
        },
        ciclos: {
          include: { product: { select: { nombre: true } } },
          orderBy: { fechaAgotamientoEstimada: 'desc' },
        },
        perfiles: { include: { product: { select: { nombre: true } } } },
      },
    }),
    prisma.product.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, duracionEstimadaDias: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.messageTemplate.findMany({ where: { activo: true } }),
    leerConfiguracion(),
  ]);

  if (!cliente) notFound();

  const hoy = hoyEnBogota();
  const ciclosVivos = cliente.ciclos.filter((c) =>
    ESTADOS_ABIERTOS.includes(c.estado as EstadoCiclo),
  );
  const gastoTotal = cliente.compras.reduce((suma, c) => suma + c.valorTotal, 0);

  const redactarPara = (ciclo: (typeof ciclosVivos)[number]) =>
    redactarMensaje({
      plantillas,
      canal: 'whatsapp',
      estado: ciclo.estado,
      nombreCompleto: cliente.nombreCompleto,
      producto: ciclo.product.nombre,
      fechaAgotamiento: aFechaCivil(ciclo.fechaAgotamientoEstimada),
      linkRecompra: config.linkRecompra,
      hoy,
    });

  // El botón de la cabecera lleva el mensaje del ciclo que se acaba antes; si
  // no hay ninguno en ventana, abre el chat en blanco.
  // Los ciclos vienen del más lejano al más cercano: se invierte para que el
  // primero sea el que se acaba antes.
  const enVentana = ciclosVivos
    .filter((c) => ['POR_VENCER', 'VENCIDO'].includes(c.estado))
    .sort(
      (a, b) =>
        a.fechaAgotamientoEstimada.getTime() - b.fechaAgotamientoEstimada.getTime(),
    );
  const mensajeMasUrgente = enVentana.length > 0 ? redactarPara(enVentana[0])?.cuerpo : null;

  return (
    <>
      <Encabezado
        titulo={cliente.nombreCompleto}
        descripcion={[
          cliente.telefono,
          cliente.email,
          cliente.ciudad,
          `alta ${formatearFecha(aFechaCivil(cliente.fechaAlta))}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        acciones={
          <>
            <Link href="/clientes">
              <Badge variant="outline" className="cursor-pointer py-1.5">
                ← Volver
              </Badge>
            </Link>
            <BotonWhatsapp
              telefono={cliente.telefono}
              mensaje={mensajeMasUrgente}
              variante="completo"
              etiqueta={mensajeMasUrgente ? 'Escribir por WhatsApp' : 'Abrir chat'}
              consentimiento={cliente.consentimientoMarketing}
            />
            <NuevaCompra clienteId={cliente.id} productos={productos} />
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {cliente.consentimientoMarketing ? (
          <Badge variant="secondary">Consiente recibir mensajes por {cliente.canalPreferido}</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Sin consentimiento: no se le genera ningún mensaje
          </Badge>
        )}
        <Badge variant="outline">{cliente.compras.length} compras</Badge>
        <Badge variant="outline">{pesos(gastoTotal)} histórico</Badge>
        <Badge variant="outline">origen: {cliente.origen}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ciclos vigentes</CardTitle>
            <CardDescription>Cuánto producto le queda según nuestras cuentas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {ciclosVivos.length === 0 ? (
              <Vacio
                titulo="Sin ciclo activo"
                descripcion="O nunca recibió un pedido, o ya recompró todo lo que tenía abierto."
              />
            ) : (
              ciclosVivos.map((c) => {
                const restantes = diasRestantes(aFechaCivil(c.fechaAgotamientoEstimada), hoy);
                return (
                  <div key={c.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{c.product.nombre}</span>
                      <div className="flex items-center gap-2">
                        <EstadoBadge estado={c.estado} />
                        <BotonWhatsapp
                          telefono={cliente.telefono}
                          mensaje={redactarPara(c)?.cuerpo}
                          consentimiento={cliente.consentimientoMarketing}
                        />
                      </div>
                    </div>
                    <BarraRestante
                      porcentaje={porcentajeRestante(
                        aFechaCivil(c.fechaInicio),
                        aFechaCivil(c.fechaAgotamientoEstimada),
                        hoy,
                      )}
                      dias={restantes}
                    />
                    <p className="text-muted-foreground text-xs">
                      Empezó {formatearFecha(aFechaCivil(c.fechaInicio))} · se le acaba{' '}
                      {formatearFecha(aFechaCivil(c.fechaAgotamientoEstimada))} · avisar el{' '}
                      {formatearFecha(aFechaCivil(c.fechaRecompraSugerida))}
                      {c.factorAjusteAplicado !== 1
                        ? ` · ajuste ×${c.factorAjusteAplicado.toFixed(2)}`
                        : ''}
                    </p>
                    <Separator />
                  </div>
                );
              })
            )}

            {cliente.perfiles.length > 0 && (
              <div className="text-muted-foreground text-xs">
                <p className="mb-1 font-medium">Consumo observado</p>
                {cliente.perfiles.map((p) => (
                  <p key={p.id}>
                    {p.product.nombre}: factor ×{p.factorAjuste.toFixed(2)}
                    {p.factorAjuste === 1 ? ' (sin historial suficiente todavía)' : ''}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de compras</CardTitle>
            <CardDescription>
              En contraentrega la fecha que cuenta es la de entrega, no la del pedido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cliente.compras.length === 0 ? (
              <Vacio titulo="Sin compras" descripcion="Este cliente todavía no tiene pedidos." />
            ) : (
              <div className="tabla-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Frascos</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Entrega</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cliente.compras.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatearFecha(aFechaCivil(c.fechaCompra))}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.product?.nombre ?? (
                            <span className="text-amber-600 dark:text-amber-400">
                              {c.motivoRevision ?? 'sin identificar'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.cantidadFrascos}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {pesos(c.valorTotal)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              c.estadoEntrega === 'entregado'
                                ? 'text-xs text-emerald-600 dark:text-emerald-400'
                                : c.estadoEntrega === 'devuelto'
                                  ? 'text-xs text-red-600 dark:text-red-400'
                                  : 'text-muted-foreground text-xs'
                            }
                          >
                            {c.estadoEntrega}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
