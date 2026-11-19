import { aDate, aFechaCivil } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { error, leerJson, leerPaginacion, manejarError, ok } from '@/lib/http';
import { auditar } from '@/lib/services/auditoria';
import { recalcularPorCompra } from '@/lib/services/ciclos';
import { EsquemaCompra } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const { pagina, porPagina, saltar } = leerPaginacion(url);
    const revision = url.searchParams.get('revision');
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const donde = {
      ...(revision === 'true' ? { requiereRevision: true } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const [total, compras] = await Promise.all([
      prisma.purchase.count({ where: donde }),
      prisma.purchase.findMany({
        where: donde,
        orderBy: { fechaCompra: 'desc' },
        skip: saltar,
        take: porPagina,
        include: {
          customer: { select: { id: true, nombreCompleto: true } },
          product: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    return ok({
      total,
      pagina,
      porPagina,
      datos: compras.map((c) => ({
        id: c.id,
        cliente: { id: c.customer.id, nombre: c.customer.nombreCompleto },
        producto: c.product ? { id: c.product.id, nombre: c.product.nombre } : null,
        cantidadFrascos: c.cantidadFrascos,
        fechaCompra: aFechaCivil(c.fechaCompra),
        estadoEntrega: c.estadoEntrega,
        valorTotal: c.valorTotal,
        tituloCrudo: c.tituloCrudo,
        requiereRevision: c.requiereRevision,
        motivoRevision: c.motivoRevision,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}

/** Registrar una compra dispara el recálculo de su ciclo en el acto. */
export async function POST(peticion: Request) {
  try {
    const datos = EsquemaCompra.parse(await leerJson(peticion));

    const [cliente, producto] = await Promise.all([
      prisma.customer.findUnique({ where: { id: datos.customerId } }),
      prisma.product.findUnique({ where: { id: datos.productId } }),
    ]);

    if (!cliente) return error('NO_ENCONTRADO', 'Ese cliente no existe.');
    if (!producto) return error('NO_ENCONTRADO', 'Ese producto no existe.');

    const claveNatural = `${datos.customerId}|${datos.productId}|${datos.fechaCompra}`;

    const duplicada = await prisma.purchase.findUnique({ where: { claveNatural } });
    if (duplicada) {
      return error(
        'CONFLICTO',
        'Ya hay una compra de ese cliente y ese producto en esa misma fecha.',
        { compraId: duplicada.id },
      );
    }

    const precioUnitario = datos.precioUnitario || producto.precio;

    const compra = await prisma.purchase.create({
      data: {
        customerId: datos.customerId,
        productId: datos.productId,
        cantidadFrascos: datos.cantidadFrascos,
        fechaCompra: aDate(datos.fechaCompra),
        fechaPedido: datos.fechaPedido ? aDate(datos.fechaPedido) : null,
        canalVenta: datos.canalVenta,
        precioUnitario,
        valorTotal: precioUnitario * datos.cantidadFrascos,
        estadoEntrega: datos.estadoEntrega,
        origen: 'manual',
        tituloCrudo: `${datos.cantidadFrascos} x ${producto.nombre}`,
        claveNatural,
      },
    });

    await auditar({
      entidad: 'Purchase',
      entidadId: compra.id,
      accion: 'creacion',
      despues: compra,
      actor: 'panel',
    });

    const ciclo = await recalcularPorCompra(compra.id, 'panel');

    return ok(
      {
        compra: { ...compra, fechaCompra: aFechaCivil(compra.fechaCompra) },
        ciclo: ciclo
          ? {
              id: ciclo.id,
              estado: ciclo.estado,
              fechaInicio: aFechaCivil(ciclo.fechaInicio),
              fechaAgotamiento: aFechaCivil(ciclo.fechaAgotamientoEstimada),
              fechaRecompraSugerida: aFechaCivil(ciclo.fechaRecompraSugerida),
              factorAjusteAplicado: ciclo.factorAjusteAplicado,
            }
          : null,
        // Un pedido no entregado se guarda, pero no arranca consumo.
        aviso:
          datos.estadoEntrega === 'entregado'
            ? null
            : 'La compra quedó registrada pero no genera ciclo hasta que se marque como entregada.',
      },
      201,
    );
  } catch (e) {
    return manejarError(e);
  }
}
