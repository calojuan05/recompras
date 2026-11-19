import { duracionEstimadaDias } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { leerJson, manejarError, ok } from '@/lib/http';
import { EsquemaProducto } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const incluirInactivos = url.searchParams.get('inactivos') === 'true';

    const productos = await prisma.product.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        alias: { select: { id: true, patron: true } },
        escalas: { select: { id: true, valor: true, unidades: true }, orderBy: { valor: 'asc' } },
        _count: { select: { compras: true, ciclos: true } },
      },
    });

    return ok({
      total: productos.length,
      datos: productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        presentacion: p.presentacion,
        unidadMedida: p.unidadMedida,
        unidadesPorFrasco: p.unidadesPorFrasco,
        dosisDiariaSugerida: p.dosisDiariaSugerida,
        duracionEstimadaDias: p.duracionEstimadaDias,
        diasDeAnticipacion: p.diasDeAnticipacion,
        precio: p.precio,
        activo: p.activo,
        alias: p.alias,
        escalas: p.escalas,
        compras: p._count.compras,
        ciclos: p._count.ciclos,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function POST(peticion: Request) {
  try {
    const datos = EsquemaProducto.parse(await leerJson(peticion));

    const producto = await prisma.product.create({
      data: {
        ...datos,
        // La duración nunca se recibe de fuera: siempre se deriva.
        duracionEstimadaDias: duracionEstimadaDias(
          datos.unidadesPorFrasco,
          datos.dosisDiariaSugerida,
        ),
      },
    });

    return ok(producto, 201);
  } catch (e) {
    return manejarError(e);
  }
}
