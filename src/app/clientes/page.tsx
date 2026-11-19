import Link from 'next/link';

import { BotonWhatsapp } from '@/components/boton-whatsapp';
import { Buscador } from '@/components/buscador';
import { BarraRestante, Encabezado, EstadoBadge, Vacio } from '@/components/comunes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  ESTADOS_CICLO,
  ETIQUETA_ESTADO,
  hoy as hoyEnBogota,
  porcentajeRestante,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { numero } from '@/lib/formato';
import { leerConfiguracion } from '@/lib/services/configuracion';
import { redactarMensaje } from '@/lib/services/notificaciones';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 30;

interface Props {
  searchParams: Promise<{ q?: string; estado?: string; ciudad?: string; pagina?: string }>;
}

export default async function PaginaClientes({ searchParams }: Props) {
  const { q = '', estado = '', ciudad = '', pagina: paginaTexto } = await searchParams;
  const pagina = Math.max(1, Number(paginaTexto) || 1);

  const donde = {
    ...(q
      ? {
          OR: [
            { nombreCompleto: { contains: q } },
            { telefono: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
    ...(ciudad ? { ciudad } : {}),
    ...(estado ? { ciclos: { some: { estado } } } : {}),
  };

  const [total, clientes, ciudades, plantillas, config] = await Promise.all([
    prisma.customer.count({ where: donde }),
    prisma.customer.findMany({
      where: donde,
      orderBy: { nombreCompleto: 'asc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        ciclos: {
          where: { estado: { in: [...ESTADOS_ABIERTOS] } },
          include: { product: { select: { nombre: true } } },
          orderBy: { fechaAgotamientoEstimada: 'asc' },
          take: 1,
        },
        _count: { select: { compras: true } },
      },
    }),
    prisma.customer.findMany({
      where: { ciudad: { not: null } },
      select: { ciudad: true },
      distinct: ['ciudad'],
      orderBy: { ciudad: 'asc' },
    }),
    prisma.messageTemplate.findMany({ where: { activo: true } }),
    leerConfiguracion(),
  ]);

  const hoy = hoyEnBogota();
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const construirUrl = (cambios: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const base = { q, estado, ciudad, pagina, ...cambios };
    for (const [clave, valor] of Object.entries(base)) {
      if (valor !== undefined && valor !== '' && !(clave === 'pagina' && valor === 1)) {
        p.set(clave, String(valor));
      }
    }
    const cadena = p.toString();
    return cadena ? `/clientes?${cadena}` : '/clientes';
  };

  return (
    <>
      <Encabezado
        titulo="Clientes"
        descripcion={`${numero(total)} clientes${q || estado || ciudad ? ' con los filtros aplicados' : ' en la base'}.`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Buscador ruta="/clientes" marcador="Nombre, teléfono o correo" />

        <div className="flex flex-wrap gap-1">
          <Link href={construirUrl({ estado: '', pagina: 1 })}>
            <Badge variant={estado ? 'outline' : 'default'} className="cursor-pointer">
              Todos
            </Badge>
          </Link>
          {ESTADOS_CICLO.filter((e) => ['POR_VENCER', 'VENCIDO', 'PROGRAMADO'].includes(e)).map(
            (e) => (
              <Link key={e} href={construirUrl({ estado: e, pagina: 1 })}>
                <Badge variant={estado === e ? 'default' : 'outline'} className="cursor-pointer">
                  {ETIQUETA_ESTADO[e]}
                </Badge>
              </Link>
            ),
          )}
        </div>

        {ciudades.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {ciudad ? (
              <Link href={construirUrl({ ciudad: '', pagina: 1 })}>
                <Badge className="cursor-pointer">{ciudad} ✕</Badge>
              </Link>
            ) : (
              ciudades
                .slice(0, 6)
                .map((c) => (
                  <Link key={c.ciudad} href={construirUrl({ ciudad: c.ciudad!, pagina: 1 })}>
                    <Badge variant="outline" className="cursor-pointer">
                      {c.ciudad}
                    </Badge>
                  </Link>
                ))
            )}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {clientes.length === 0 ? (
            <Vacio
              titulo="Ningún cliente coincide"
              descripcion="Prueba con otro nombre o quita los filtros. Si la base está vacía, corre una sincronización desde Configuración."
              accion={
                <Link href="/configuracion">
                  <Button size="sm" variant="outline">
                    Ir a Configuración
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="tabla-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead>Ciclo vigente</TableHead>
                    <TableHead>Producto restante</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="text-center">Chat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => {
                    const ciclo = c.ciclos[0];
                    // Solo se precarga texto si tiene un ciclo en ventana; para
                    // el resto el botón abre el chat en blanco.
                    const redactado =
                      ciclo && ['POR_VENCER', 'VENCIDO'].includes(ciclo.estado)
                        ? redactarMensaje({
                            plantillas,
                            canal: 'whatsapp',
                            estado: ciclo.estado,
                            nombreCompleto: c.nombreCompleto,
                            producto: ciclo.product.nombre,
                            fechaAgotamiento: aFechaCivil(ciclo.fechaAgotamientoEstimada),
                            linkRecompra: config.linkRecompra,
                            hoy,
                          })
                        : null;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/clientes/${c.id}`}
                            className="font-medium hover:underline"
                          >
                            {c.nombreCompleto}
                          </Link>
                          <p className="text-muted-foreground text-xs">{c.telefono ?? '—'}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.ciudad ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c._count.compras}
                        </TableCell>
                        <TableCell>
                          {ciclo ? (
                            <div className="flex flex-col gap-1">
                              <EstadoBadge estado={ciclo.estado} />
                              <span className="text-muted-foreground text-xs">
                                {ciclo.product.nombre}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">sin ciclo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ciclo ? (
                            <BarraRestante
                              porcentaje={porcentajeRestante(
                                aFechaCivil(ciclo.fechaInicio),
                                aFechaCivil(ciclo.fechaAgotamientoEstimada),
                                hoy,
                              )}
                              dias={diasRestantes(
                                aFechaCivil(ciclo.fechaAgotamientoEstimada),
                                hoy,
                              )}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.consentimientoMarketing ? (
                            <span className="text-muted-foreground text-xs">
                              {c.canalPreferido}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              sin consentimiento
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <BotonWhatsapp
                              telefono={c.telefono}
                              mensaje={redactado?.cuerpo}
                              consentimiento={c.consentimientoMarketing}
                            />
                          </div>
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
        <div className="flex items-center justify-between">
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
    </>
  );
}
