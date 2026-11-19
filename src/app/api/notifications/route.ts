import { prisma } from '@/lib/db';
import { leerPaginacion, manejarError, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Bandeja de salida. */
export async function GET(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const { pagina, porPagina, saltar } = leerPaginacion(url, 50);
    const estado = url.searchParams.get('estado')?.trim() ?? '';

    const donde = estado ? { estado } : {};

    const [total, mensajes, porEstado] = await Promise.all([
      prisma.notificationOutbox.count({ where: donde }),
      prisma.notificationOutbox.findMany({
        where: donde,
        orderBy: { creadoEn: 'desc' },
        skip: saltar,
        take: porPagina,
        include: {
          cycle: {
            include: {
              customer: { select: { id: true, nombreCompleto: true } },
              product: { select: { nombre: true } },
            },
          },
        },
      }),
      prisma.notificationOutbox.groupBy({ by: ['estado'], _count: { _all: true } }),
    ]);

    return ok({
      total,
      pagina,
      porPagina,
      resumen: Object.fromEntries(porEstado.map((f) => [f.estado, f._count._all])),
      datos: mensajes.map((m) => ({
        id: m.id,
        canal: m.canal,
        plantilla: m.plantilla,
        destinatario: m.destinatario,
        cuerpo: m.cuerpo,
        estado: m.estado,
        error: m.error,
        creadoEn: m.creadoEn,
        enviadoAt: m.enviadoAt,
        cliente: {
          id: m.cycle.customer.id,
          nombre: m.cycle.customer.nombreCompleto,
        },
        producto: m.cycle.product.nombre,
        cicloId: m.cycleId,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}
