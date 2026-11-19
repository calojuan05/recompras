import { Encabezado } from '@/components/comunes';
import {
  FormularioConfiguracion,
  PanelMotor,
  PanelSincronizacion,
} from '@/components/panel-configuracion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db';
import { fechaHora } from '@/lib/formato';
import { leerConfiguracion } from '@/lib/services/configuracion';
import { ultimaEjecucion } from '@/lib/services/motor';

export const dynamic = 'force-dynamic';

export default async function PaginaConfiguracion() {
  const [config, ultima, auditoria] = await Promise.all([
    leerConfiguracion(),
    ultimaEjecucion(),
    prisma.auditLog.findMany({ orderBy: { creadoEn: 'desc' }, take: 20 }),
  ]);

  return (
    <>
      <Encabezado
        titulo="Configuración"
        descripcion="Parámetros de operación, motor de programación e ingesta de datos."
      />

      <FormularioConfiguracion inicial={config} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PanelMotor
          ultimaEjecucion={ultima ? fechaHora(ultima.creadoEn) : null}
          cronActivo={process.env.CRON_ACTIVO !== 'false'}
          horario={process.env.CRON_HORA ?? '0 8 * * *'}
        />
        <PanelSincronizacion fuente={config.fuenteDatos} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoría reciente</CardTitle>
          <CardDescription>
            Todo cambio que no hizo una persona a mano queda explicado aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="tabla-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditoria.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {fechaHora(a.creadoEn)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {a.entidad}
                    </TableCell>
                    <TableCell className="text-sm">{a.accion}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{a.actor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciales</CardTitle>
          <CardDescription>
            No se editan desde aquí a propósito: viven en el archivo <code>.env</code> y nunca
            salen del servidor. Si el navegador pudiera leerlas, cualquiera con acceso al
            panel tendría el token de Lucid Bot.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
          <p>
            Lucid Bot:{' '}
            {process.env.LUCIDBOT_TOKEN ? (
              <span className="text-emerald-600 dark:text-emerald-400">configurado</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">sin token</span>
            )}
            {process.env.LUCIDBOT_PIPELINE_ID
              ? ` · pipeline ${process.env.LUCIDBOT_PIPELINE_ID}`
              : ''}
          </p>
          <p>
            WhatsApp:{' '}
            {process.env.WHATSAPP_TOKEN ? (
              <span className="text-emerald-600 dark:text-emerald-400">configurado</span>
            ) : (
              'sin credenciales (el modo real fallaría de forma explícita)'
            )}
          </p>
          <p>
            Correo:{' '}
            {process.env.SMTP_HOST ? (
              <span className="text-emerald-600 dark:text-emerald-400">configurado</span>
            ) : (
              'sin SMTP'
            )}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
