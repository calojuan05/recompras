import Link from 'next/link';

import { AccionesCiclo, BotonRecalcular } from '@/components/acciones-ciclo';
import { BotonWhatsapp } from '@/components/boton-whatsapp';
import { Buscador } from '@/components/buscador';
import { BarraRestante, Encabezado, EstadoBadge, Vacio } from '@/components/comunes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  aDate,
  aFechaCivil,
  compararFechas,
  diasRestantes,
  ESTADOS_ABIERTOS,
  ESTADOS_CICLO,
  ETIQUETA_ESTADO,
  formatearFecha,
  hoy as hoyEnBogota,
  inicioDeSemana,
  porcentajeRestante,
  sumarDias,
  type FechaCivil,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { numero } from '@/lib/formato';
import { leerConfiguracion } from '@/lib/services/configuracion';
import { redactarMensaje } from '@/lib/services/notificaciones';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 40;
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

interface Props {
  searchParams: Promise<{
    estado?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    revision?: string;
    pagina?: string;
  }>;
}

export default async function PaginaCiclos({ searchParams }: Props) {
  const {
    estado = '',
    q = '',
    desde = '',
    hasta = '',
    revision = '',
    pagina: paginaTexto,
  } = await searchParams;
  const pagina = Math.max(1, Number(paginaTexto) || 1);
  const hoy = hoyEnBogota();

  // Vista de revisión: pedidos que la ingesta no supo interpretar.
  if (revision === 'true') {
    const enRevision = await prisma.purchase.findMany({
      where: { requiereRevision: true },
      include: { customer: { select: { id: true, nombreCompleto: true } } },
      orderBy: { fechaCompra: 'desc' },
      take: 100,
    });

    return (
      <>
        <Encabezado
          titulo="Pedidos en revisión"
          descripcion="La ingesta no pudo deducir el producto o la cantidad, así que no generó ciclo. Prefiere quedarse callada antes que estimar a ciegas."
          acciones={
            <Link href="/ciclos">
              <Button variant="outline" size="sm">
                ← Volver a ciclos
              </Button>
            </Link>
          }
        />
        <Card>
          <CardContent className="pt-6">
            {enRevision.length === 0 ? (
              <Vacio
                titulo="Nada pendiente de revisar"
                descripcion="Todos los pedidos se interpretaron solos."
              />
            ) : (
              <div className="tabla-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Título recibido</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enRevision.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatearFecha(aFechaCivil(c.fechaCompra))}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/clientes/${c.customer.id}`}
                            className="text-sm hover:underline"
                          >
                            {c.customer.nombreCompleto}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-72 truncate text-xs">
                          {c.tituloCrudo || <em>(vacío)</em>}
                        </TableCell>
                        <TableCell className="text-xs text-amber-700 dark:text-amber-400">
                          {c.motivoRevision}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  const rango =
    desde || hasta
      ? {
          fechaRecompraSugerida: {
            ...(desde ? { gte: aDate(desde) } : {}),
            ...(hasta ? { lte: aDate(hasta) } : {}),
          },
        }
      : {};

  const donde = {
    ...(estado ? { estado } : {}),
    ...rango,
    ...(q
      ? {
          customer: {
            OR: [{ nombreCompleto: { contains: q } }, { telefono: { contains: q } }],
          },
        }
      : {}),
  };

  // El calendario cubre seis semanas desde el lunes de esta semana.
  const inicioCalendario = inicioDeSemana(hoy);
  const finCalendario = sumarDias(inicioCalendario, 42);

  const [total, ciclos, porEstado, delCalendario, plantillas, config] = await Promise.all([
    prisma.repurchaseCycle.count({ where: donde }),
    prisma.repurchaseCycle.findMany({
      where: donde,
      orderBy: { fechaRecompraSugerida: 'asc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        customer: {
          select: {
            id: true,
            nombreCompleto: true,
            telefono: true,
            consentimientoMarketing: true,
          },
        },
        product: { select: { nombre: true } },
      },
    }),
    prisma.repurchaseCycle.groupBy({ by: ['estado'], _count: { _all: true } }),
    prisma.repurchaseCycle.findMany({
      where: {
        estado: { in: [...ESTADOS_ABIERTOS] },
        fechaRecompraSugerida: { gte: aDate(inicioCalendario), lt: aDate(finCalendario) },
      },
      include: {
        customer: { select: { id: true, nombreCompleto: true } },
        product: { select: { nombre: true } },
      },
      orderBy: { fechaRecompraSugerida: 'asc' },
    }),
    prisma.messageTemplate.findMany({ where: { activo: true } }),
    leerConfiguracion(),
  ]);

  const resumen = Object.fromEntries(porEstado.map((f) => [f.estado, f._count._all]));
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const construirUrl = (cambios: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const base = { estado, q, desde, hasta, pagina, ...cambios };
    for (const [clave, valor] of Object.entries(base)) {
      if (valor !== undefined && valor !== '' && !(clave === 'pagina' && valor === 1)) {
        p.set(clave, String(valor));
      }
    }
    const cadena = p.toString();
    return cadena ? `/ciclos?${cadena}` : '/ciclos';
  };

  // Agrupa por día para el calendario.
  const porDia = new Map<FechaCivil, typeof delCalendario>();
  for (const c of delCalendario) {
    const dia = aFechaCivil(c.fechaRecompraSugerida);
    const lista = porDia.get(dia) ?? [];
    lista.push(c);
    porDia.set(dia, lista);
  }

  return (
    <>
      <Encabezado
        titulo="Ciclos de recompra"
        descripcion={`${numero(total)} ciclos con los filtros actuales.`}
        acciones={
          <>
            <Link href="/ciclos?revision=true">
              <Button variant="outline" size="sm">
                Ver pedidos en revisión
              </Button>
            </Link>
            <BotonRecalcular />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Buscador ruta="/ciclos" marcador="Cliente o teléfono" />
        <Link href={construirUrl({ estado: '', pagina: 1 })}>
          <Badge variant={estado ? 'outline' : 'default'} className="cursor-pointer">
            Todos ({numero(total)})
          </Badge>
        </Link>
        {ESTADOS_CICLO.map((e) => (
          <Link key={e} href={construirUrl({ estado: e, pagina: 1 })}>
            <Badge variant={estado === e ? 'default' : 'outline'} className="cursor-pointer">
              {ETIQUETA_ESTADO[e]} ({numero(resumen[e] ?? 0)})
            </Badge>
          </Link>
        ))}
      </div>

      <Tabs defaultValue="tabla">
        <TabsList>
          <TabsTrigger value="tabla">Tabla</TabsTrigger>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
        </TabsList>

        <TabsContent value="tabla" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {ciclos.length === 0 ? (
                <Vacio
                  titulo="Ningún ciclo coincide"
                  descripcion="Cambia los filtros, o recalcula si acabas de cargar compras nuevas."
                />
              ) : (
                <div className="tabla-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Avisar el</TableHead>
                        <TableHead>Se le acaba</TableHead>
                        <TableHead>Restante</TableHead>
                        <TableHead className="text-right">Contactos</TableHead>
                        <TableHead className="text-center">Chat</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ciclos.map((c) => {
                        const agotamiento = aFechaCivil(c.fechaAgotamientoEstimada);
                        const restantes = diasRestantes(agotamiento, hoy);
                        // El mismo texto que usaría el job, para que el chat y
                        // la bandeja nunca digan cosas distintas.
                        const redactado = redactarMensaje({
                          plantillas,
                          canal: 'whatsapp',
                          estado: c.estado,
                          nombreCompleto: c.customer.nombreCompleto,
                          producto: c.product.nombre,
                          fechaAgotamiento: agotamiento,
                          linkRecompra: config.linkRecompra,
                          hoy,
                        });
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Link
                                href={`/clientes/${c.customer.id}`}
                                className="text-sm font-medium hover:underline"
                              >
                                {c.customer.nombreCompleto}
                              </Link>
                              {!c.customer.consentimientoMarketing && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  sin consentimiento
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {c.product.nombre}
                            </TableCell>
                            <TableCell>
                              <EstadoBadge estado={c.estado} />
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {formatearFecha(aFechaCivil(c.fechaRecompraSugerida))}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {formatearFecha(agotamiento)}
                            </TableCell>
                            <TableCell>
                              <BarraRestante
                                porcentaje={porcentajeRestante(
                                  aFechaCivil(c.fechaInicio),
                                  agotamiento,
                                  hoy,
                                )}
                                dias={restantes}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.intentosContacto}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-center">
                                <BotonWhatsapp
                                  telefono={c.customer.telefono}
                                  mensaje={redactado?.cuerpo}
                                  consentimiento={c.customer.consentimientoMarketing}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <AccionesCiclo cicloId={c.id} estado={c.estado} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Página {pagina} de {paginas}
              </p>
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Link href={construirUrl({ pagina: pagina - 1 })}>
                    <Button variant="outline" size="sm">
                      Anterior
                    </Button>
                  </Link>
                )}
                {pagina < paginas && (
                  <Link href={construirUrl({ pagina: pagina + 1 })}>
                    <Button variant="outline" size="sm">
                      Siguiente
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próximas seis semanas</CardTitle>
              <CardDescription>
                Cada día muestra los clientes a los que toca avisar. Solo ciclos abiertos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="tabla-scroll">
                <div className="min-w-3xl">
                  <div className="mb-1 grid grid-cols-7 gap-1">
                    {DIAS_SEMANA.map((d) => (
                      <div
                        key={d}
                        className="text-muted-foreground px-1 text-center text-xs font-medium"
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 42 }).map((_, i) => {
                      const dia = sumarDias(inicioCalendario, i);
                      const delDia = porDia.get(dia) ?? [];
                      const esHoy = compararFechas(dia, hoy) === 0;
                      const numeroDia = Number(dia.slice(8, 10));

                      return (
                        <div
                          key={dia}
                          className={`min-h-24 rounded-md border p-1.5 ${
                            esHoy
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-card'
                          }`}
                        >
                          <div className="mb-1 flex items-baseline justify-between">
                            <span
                              className={`text-xs ${esHoy ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                            >
                              {numeroDia === 1 ? formatearFecha(dia).slice(0, 6) : numeroDia}
                            </span>
                            {delDia.length > 0 && (
                              <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] leading-4">
                                {delDia.length}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {delDia.slice(0, 3).map((c) => (
                              <Link
                                key={c.id}
                                href={`/clientes/${c.customer.id}`}
                                className="hover:bg-accent block truncate rounded px-1 text-[10px] leading-4"
                                title={`${c.customer.nombreCompleto} — ${c.product.nombre}`}
                              >
                                {c.customer.nombreCompleto.split(' ')[0]}{' '}
                                <span className="text-muted-foreground">
                                  {c.product.nombre.split(' ')[0]}
                                </span>
                              </Link>
                            ))}
                            {delDia.length > 3 && (
                              <span className="text-muted-foreground px-1 text-[10px]">
                                +{delDia.length - 3} más
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
