import {
  aDate,
  aFechaCivil,
  diasRestantes,
  ESTADOS_ABIERTOS,
  hoy as hoyEnBogota,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { leerJson, leerPaginacion, manejarError, ok } from '@/lib/http';
import { EsquemaCliente } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const { pagina, porPagina, saltar } = leerPaginacion(url);

    const busqueda = url.searchParams.get('q')?.trim() ?? '';
    const ciudad = url.searchParams.get('ciudad')?.trim() ?? '';
    const estadoCiclo = url.searchParams.get('estado')?.trim() ?? '';
    const soloConsentimiento = url.searchParams.get('consentimiento') === 'true';

    const donde = {
      ...(busqueda
        ? {
            OR: [
              { nombreCompleto: { contains: busqueda } },
              { telefono: { contains: busqueda } },
              { email: { contains: busqueda } },
            ],
          }
        : {}),
      ...(ciudad ? { ciudad } : {}),
      ...(soloConsentimiento ? { consentimientoMarketing: true } : {}),
      ...(estadoCiclo ? { ciclos: { some: { estado: estadoCiclo } } } : {}),
    };

    const [total, clientes] = await Promise.all([
      prisma.customer.count({ where: donde }),
      prisma.customer.findMany({
        where: donde,
        orderBy: { nombreCompleto: 'asc' },
        skip: saltar,
        take: porPagina,
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
    ]);

    const hoy = hoyEnBogota();

    return ok({
      total,
      pagina,
      porPagina,
      datos: clientes.map((c) => {
        const ciclo = c.ciclos[0];
        return {
          id: c.id,
          nombreCompleto: c.nombreCompleto,
          telefono: c.telefono,
          email: c.email,
          ciudad: c.ciudad,
          canalPreferido: c.canalPreferido,
          consentimientoMarketing: c.consentimientoMarketing,
          activo: c.activo,
          compras: c._count.compras,
          cicloVigente: ciclo
            ? {
                id: ciclo.id,
                producto: ciclo.product.nombre,
                estado: ciclo.estado,
                fechaAgotamiento: aFechaCivil(ciclo.fechaAgotamientoEstimada),
                diasRestantes: diasRestantes(aFechaCivil(ciclo.fechaAgotamientoEstimada), hoy),
              }
            : null,
        };
      }),
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function POST(peticion: Request) {
  try {
    const datos = EsquemaCliente.parse(await leerJson(peticion));

    const cliente = await prisma.customer.create({
      data: { ...datos, origen: 'manual', fechaAlta: aDate(hoyEnBogota()) },
    });

    return ok(cliente, 201);
  } catch (e) {
    return manejarError(e);
  }
}
