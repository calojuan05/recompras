/**
 * Arranque del motor de programación.
 *
 * Next ejecuta este `register()` una vez al levantar el servidor, y aquí es
 * donde se engancha el cron diario. Corre dentro del mismo proceso a propósito:
 * la plataforma tiene que funcionar entera en localhost, sin depender de un
 * scheduler externo ni de un servicio en la nube.
 *
 * Se puede apagar con CRON_ACTIVO=false y disparar el job a mano desde
 * Configuración → "Ejecutar ahora".
 */

const global_ = globalThis as unknown as { cronRegistrado?: boolean };

export async function register() {
  // El runtime edge no tiene ni timers largos ni acceso a la base.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  if (process.env.CRON_ACTIVO === 'false') {
    console.log('[motor] cron desactivado por CRON_ACTIVO=false.');
    return;
  }

  // En desarrollo Next puede volver a registrar al recargar en caliente.
  if (global_.cronRegistrado) return;
  global_.cronRegistrado = true;

  const expresion = process.env.CRON_HORA || '0 8 * * *';
  const zona = process.env.ZONA_HORARIA || 'America/Bogota';

  const { schedule } = await import('node-cron');

  schedule(
    expresion,
    async () => {
      const { ejecutarJobDiario } = await import('@/lib/services/motor');
      try {
        const resumen = await ejecutarJobDiario('cron');
        console.log(
          `[motor] ${resumen.dia}: ${resumen.transiciones.length} ciclos cambiaron de estado, ` +
            `${resumen.notificaciones.mensajesCreados} mensajes preparados ` +
            `(${(resumen.duracionMs / 1000).toFixed(1)} s).`,
        );
      } catch (error) {
        // Que falle una noche no puede tumbar el servidor.
        console.error('[motor] el job diario falló:', error);
      }
    },
    { timezone: zona },
  );

  console.log(`[motor] cron activo: "${expresion}" en ${zona}.`);
}
