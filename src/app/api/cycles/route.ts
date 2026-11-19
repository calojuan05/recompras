import {
  aDate,
  aFechaCivil,
  diasRestantes,
  hoy as hoyEnBogota,
  porcentajeRestante,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { leerPaginacion, manejarError, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const { pagina, porPagina, saltar } = leerPaginacion(url, 50);

    const estado = url.searchParams.get('estado')?.trim() ?? '';
    const desde = url.searchParams.get('desde')?.trim() ?? '';
    const hasta = url.searchParams.get('hasta')?.trim() ?? '';
    const busqueda = url.searchParams.get('q')?.trim() ?? '';
    const productId = url.searchParams.get('productId')?.trim() ?? '';

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
      ...(productId ? { productId } : {}),
      ...rango,
      ...(busqueda
        ? {
            customer: {
              OR: [
                { nombreCompleto: { contains: busqueda } },
                { telefono: { contains: busqueda } },
              ],
            },
          }
        : {}),
    };

    const [total, ciclos, porEstado] = await Promise.all([
      prisma.repurchaseCycle.count({ where: donde }),
      prisma.repurchaseCycle.findMany({
        where: donde,
        orderBy: { fechaRecompraSugerida: 'asc' },
        skip: saltar,
        take: porPagina,
        include: {
          customer: {
            select: {
              id: true,
              nombreCompleto: true,
              telefono: true,
              canalPreferido: true,
              consentimientoMarketing: true,
            },
          },
          product: { select: { id: true, nombre: true, precio: true } },
        },
      }),
      prisma.repurchaseCycle.groupBy({ by: ['estado'], _count: { _all: true } }),
    ]);

    const hoy = hoyEnBogota();

    return ok({
      total,
      pagina,
      porPagina,
      resumen: Object.fromEntries(porEstado.map((f) => [f.estado, f._count._all])),
      datos: ciclos.map((c) => ({
        id: c.id,
        cliente: {
          id: c.customer.id,
          nombre: c.customer.nombreCompleto,
          telefono: c.customer.telefono,
          canal: c.customer.canalPreferido,
          consentimiento: c.customer.consentimientoMarketing,
        },
        producto: { id: c.product.id, nombre: c.product.nombre, precio: c.product.precio },
        estado: c.estado,
        fechaInicio: aFechaCivil(c.fechaInicio),
        fechaAgotamiento: aFechaCivil(c.fechaAgotamientoEstimada),
        fechaRecompraSugerida: aFechaCivil(c.fechaRecompraSugerida),
        diasDeAnticipacion: c.diasDeAnticipacion,
        diasRestantes: diasRestantes(aFechaCivil(c.fechaAgotamientoEstimada), hoy),
        porcentajeRestante: porcentajeRestante(
          aFechaCivil(c.fechaInicio),
          aFechaCivil(c.fechaAgotamientoEstimada),
          hoy,
        ),
        factorAjusteAplicado: c.factorAjusteAplicado,
        intentosContacto: c.intentosContacto,
        ultimoContactoAt: c.ultimoContactoAt,
        notas: c.notas,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}
