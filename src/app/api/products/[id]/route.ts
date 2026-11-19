import { duracionEstimadaDias } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { error, leerJson, manejarError, ok } from '@/lib/http';
import { auditar } from '@/lib/services/auditoria';
import { recalcularCiclos } from '@/lib/services/ciclos';
import { EsquemaProductoParcial } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const cambios = EsquemaProductoParcial.parse(await leerJson(peticion));

    const antes = await prisma.product.findUnique({ where: { id } });
    if (!antes) return error('NO_ENCONTRADO', 'Ese producto no existe.');

    const unidades = cambios.unidadesPorFrasco ?? antes.unidadesPorFrasco;
    const dosis = cambios.dosisDiariaSugerida ?? antes.dosisDiariaSugerida;

    const producto = await prisma.product.update({
      where: { id },
      data: { ...cambios, duracionEstimadaDias: duracionEstimadaDias(unidades, dosis) },
    });

    await auditar({
      entidad: 'Product',
      entidadId: id,
      accion: 'actualizacion',
      antes: {
        unidadesPorFrasco: antes.unidadesPorFrasco,
        dosisDiariaSugerida: antes.dosisDiariaSugerida,
        duracionEstimadaDias: antes.duracionEstimadaDias,
        diasDeAnticipacion: antes.diasDeAnticipacion,
      },
      despues: {
        unidadesPorFrasco: producto.unidadesPorFrasco,
        dosisDiariaSugerida: producto.dosisDiariaSugerida,
        duracionEstimadaDias: producto.duracionEstimadaDias,
        diasDeAnticipacion: producto.diasDeAnticipacion,
      },
      actor: 'panel',
    });

    // Cambiar la dosis mueve todas las fechas de ese producto: hay que
    // recalcular ahí mismo o el panel quedaría mintiendo hasta el día siguiente.
    const afectaFechas =
      producto.duracionEstimadaDias !== antes.duracionEstimadaDias ||
      producto.diasDeAnticipacion !== antes.diasDeAnticipacion;

    const recalculo = afectaFechas
      ? await recalcularCiclos({ productId: id, actor: 'panel' })
      : null;

    return ok({ producto, recalculo });
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(_peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;

    const producto = await prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { compras: true } } },
    });
    if (!producto) return error('NO_ENCONTRADO', 'Ese producto no existe.');

    // Borrar un producto con compras arrastraría su historial: se desactiva.
    if (producto._count.compras > 0) {
      const desactivado = await prisma.product.update({
        where: { id },
        data: { activo: false },
      });
      return ok({
        producto: desactivado,
        mensaje: `Tiene ${producto._count.compras} compras asociadas, así que se desactivó en vez de borrarse.`,
      });
    }

    await prisma.product.delete({ where: { id } });
    return ok({ eliminado: true });
  } catch (e) {
    return manejarError(e);
  }
}
