import Link from 'next/link';

import { Encabezado } from '@/components/comunes';
import { GraficoProyeccion } from '@/components/grafico-proyeccion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatearFecha } from '@/lib/domain';
import { numero, pesos, pesosCortos, porcentaje } from '@/lib/formato';
import { calcularMetricas } from '@/lib/services/metricas';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Kpi({
  titulo,
  valor,
  detalle,
  acento,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  acento?: 'alerta' | 'aviso';
}) {
  return (
    <Card
      className={cn(
        acento === 'alerta' &&
          'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/30',
        acento === 'aviso' &&
          'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25',
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{titulo}</CardDescription>
        <CardTitle
          className={
            acento === 'alerta'
              ? 'text-3xl text-red-600 tabular-nums dark:text-red-400'
              : acento === 'aviso'
                ? 'text-3xl text-amber-600 tabular-nums dark:text-amber-400'
                : 'text-3xl tabular-nums'
          }
        >
          {valor}
        </CardTitle>
      </CardHeader>
      {detalle ? (
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">{detalle}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

export default async function PaginaPanel() {
  const m = await calcularMetricas();

  return (
    <>
      <Encabezado
        titulo="Panel"
        descripcion={`Estado de la recompra al ${formatearFecha(m.hoy)}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi
          titulo="Clientes con ciclo activo"
          valor={numero(m.clientesActivos)}
          detalle={`de ${numero(m.clientesTotales)} en la base`}
        />
        <Kpi
          titulo="Por vencer en 7 días"
          valor={numero(m.porVencer7)}
          detalle="entran en ventana de contacto"
          acento={m.porVencer7 > 0 ? 'aviso' : undefined}
        />
        <Kpi titulo="Por vencer en 15 días" valor={numero(m.porVencer15)} />
        <Kpi titulo="Por vencer en 30 días" valor={numero(m.porVencer30)} />
        <Kpi
          titulo="Vencidos sin recompra"
          valor={numero(m.vencidosSinRecompra)}
          detalle="ya se quedaron sin producto"
          acento={m.vencidosSinRecompra > 0 ? 'alerta' : undefined}
        />
        <Kpi
          titulo="Contactados sin respuesta"
          valor={numero(m.contactadosSinRespuesta)}
          detalle="ya se les escribió y no han vuelto"
        />
        <Kpi
          titulo="Tasa de recompra"
          valor={porcentaje(m.tasaConversion)}
          detalle={`ticket promedio ${pesosCortos(m.ticketPromedioRecompra)}`}
        />
      </div>

      {(m.comprasEnRevision > 0 || m.sinConsentimiento > 0 || m.mensajesPendientes > 0) && (
        <div className="flex flex-wrap gap-2">
          {m.comprasEnRevision > 0 && (
            <Link href="/ciclos?revision=true">
              <Badge variant="outline" className="hover:bg-accent cursor-pointer py-1.5">
                {numero(m.comprasEnRevision)} pedidos necesitan revisión manual
              </Badge>
            </Link>
          )}
          {m.sinConsentimiento > 0 && (
            <Badge variant="outline" className="py-1.5">
              {numero(m.sinConsentimiento)} clientes sin consentimiento: no se les escribe
            </Badge>
          )}
          {m.mensajesPendientes > 0 && (
            <Link href="/mensajeria">
              <Badge variant="outline" className="hover:bg-accent cursor-pointer py-1.5">
                {numero(m.mensajesPendientes)} mensajes esperando aprobación
              </Badge>
            </Link>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recompras proyectadas</CardTitle>
          <CardDescription>
            Ciclos que entran en ventana cada semana durante los próximos tres meses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoProyeccion datos={m.proyeccion} />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Valor proyectado de las próximas doce semanas:{' '}
        {pesos(m.proyeccion.reduce((suma, p) => suma + p.valorEstimado, 0))}. Es una
        estimación a precio de lista, no una promesa de venta.
      </p>
    </>
  );
}
