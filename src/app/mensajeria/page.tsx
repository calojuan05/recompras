import Link from 'next/link';

import { BotonWhatsapp } from '@/components/boton-whatsapp';
import { Encabezado, Vacio } from '@/components/comunes';
import { AccionesMensajeria, EditorPlantilla } from '@/components/panel-mensajeria';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { prisma } from '@/lib/db';
import { fechaHora, numero } from '@/lib/formato';
import { leerConfiguracion } from '@/lib/services/configuracion';

export const dynamic = 'force-dynamic';

const COLOR_ESTADO: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  SIMULADO: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  ENVIADO: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  FALLIDO: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  CANCELADO: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

interface Props {
  searchParams: Promise<{ estado?: string }>;
}

export default async function PaginaMensajeria({ searchParams }: Props) {
  const { estado = '' } = await searchParams;

  const [config, plantillas, mensajes, porEstado, total] = await Promise.all([
    leerConfiguracion(),
    prisma.messageTemplate.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.notificationOutbox.findMany({
      where: estado ? { estado } : undefined,
      orderBy: { creadoEn: 'desc' },
      take: 60,
      include: {
        cycle: {
          include: {
            customer: {
              select: { id: true, nombreCompleto: true, consentimientoMarketing: true },
            },
            product: { select: { nombre: true } },
          },
        },
      },
    }),
    prisma.notificationOutbox.groupBy({ by: ['estado'], _count: { _all: true } }),
    prisma.notificationOutbox.count(),
  ]);

  const resumen = Object.fromEntries(porEstado.map((f) => [f.estado, f._count._all]));

  return (
    <>
      <Encabezado
        titulo="Mensajería"
        descripcion="Los mensajes se preparan aquí y esperan aprobación. Nada sale solo."
        acciones={<AccionesMensajeria modoEnvio={config.modoEnvio} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        {config.modoEnvio === 'simulado' ? (
          <Badge className="bg-sky-100 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-200">
            Modo simulado: los mensajes se guardan pero no salen a ningún cliente
          </Badge>
        ) : (
          <Badge className="bg-red-100 py-1.5 text-red-900 dark:bg-red-950 dark:text-red-200">
            Modo real: al procesar la bandeja se intentará enviar de verdad
          </Badge>
        )}
        <Badge variant="outline" className="py-1.5">
          Un contacto cada {config.diasEntreContactos} días como máximo
        </Badge>
      </div>

      <Tabs defaultValue="bandeja">
        <TabsList>
          <TabsTrigger value="bandeja">Bandeja ({numero(total)})</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas ({plantillas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bandeja" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-1">
            <Link href="/mensajeria">
              <Badge variant={estado ? 'outline' : 'default'} className="cursor-pointer">
                Todos ({numero(total)})
              </Badge>
            </Link>
            {['PENDIENTE', 'SIMULADO', 'ENVIADO', 'FALLIDO'].map((e) => (
              <Link key={e} href={`/mensajeria?estado=${e}`}>
                <Badge
                  variant={estado === e ? 'default' : 'outline'}
                  className="cursor-pointer"
                >
                  {e} ({numero(resumen[e] ?? 0)})
                </Badge>
              </Link>
            ))}
          </div>

          {mensajes.length === 0 ? (
            <Vacio
              titulo="La bandeja está vacía"
              descripcion='Usa "Preparar mensajes" para generar los de los ciclos que ya entraron en ventana. Si no aparece ninguno, es que nadie está por quedarse sin producto o que los candidatos no tienen consentimiento.'
            />
          ) : (
            <div className="flex flex-col gap-3">
              {mensajes.map((m) => (
                <Card key={m.id}>
                  <CardContent className="flex flex-col gap-2 pt-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={COLOR_ESTADO[m.estado] ?? ''}>
                        {m.estado}
                      </Badge>
                      <Link
                        href={`/clientes/${m.cycle.customer.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {m.cycle.customer.nombreCompleto}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {m.canal} · {m.destinatario} · {m.cycle.product.nombre}
                      </span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {m.enviadoAt
                          ? `procesado ${fechaHora(m.enviadoAt)}`
                          : `creado ${fechaHora(m.creadoEn)}`}
                      </span>
                      {m.canal === 'whatsapp' && (
                        <BotonWhatsapp
                          telefono={m.destinatario}
                          mensaje={m.cuerpo}
                          variante="completo"
                          etiqueta="Abrir chat"
                          consentimiento={m.cycle.customer.consentimientoMarketing}
                        />
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.cuerpo}</p>
                    {m.error && (
                      <p className="text-xs text-red-600 dark:text-red-400">{m.error}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="plantillas" className="mt-4 flex flex-col gap-4">
          <Card className="border-amber-200 dark:border-amber-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Sobre el texto de los mensajes</CardTitle>
              <CardDescription className="text-xs">
                Son suplementos, no medicamentos: las plantillas no deben prometer resultados
                terapéuticos. Conviene que el texto final lo revise quien lleve el tema
                regulatorio. La variable{' '}
                <code className="bg-muted rounded px-1">{'{{dias_restantes}}'}</code> ya viene
                redactada (&ldquo;7 días&rdquo;, &ldquo;se terminó ayer&rdquo;), así que la
                plantilla no debe repetir la palabra días.
              </CardDescription>
            </CardHeader>
          </Card>

          {plantillas.length === 0 ? (
            <Vacio
              titulo="Sin plantillas"
              descripcion="Corre `npm run seed:catalogo` para cargar las tres plantillas base."
            />
          ) : (
            plantillas.map((p) => <EditorPlantilla key={p.id} plantilla={p} />)
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
