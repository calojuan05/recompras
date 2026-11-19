import {
  aFechaCivil,
  diasRestantes,
  hoy as hoyEnBogota,
  porcentajeRestante,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { error, leerJson, manejarError, ok } from '@/lib/http';
import { EsquemaClienteParcial } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;

    const cliente = await prisma.customer.findUnique({
      where: { id },
      include: {
        compras: {
          include: { product: { select: { nombre: true, unidadMedida: true } } },
          orderBy: { fechaCompra: 'desc' },
        },
        ciclos: {
          include: { product: { select: { nombre: true } } },
          orderBy: { fechaAgotamientoEstimada: 'desc' },
        },
        perfiles: { include: { product: { select: { nombre: true } } } },
      },
    });

    if (!cliente) return error('NO_ENCONTRADO', 'Ese cliente no existe.');

    const hoy = hoyEnBogota();

    return ok({
      id: cliente.id,
      externalId: cliente.externalId,
      nombreCompleto: cliente.nombreCompleto,
      email: cliente.email,
      telefono: cliente.telefono,
      ciudad: cliente.ciudad,
      canalPreferido: cliente.canalPreferido,
      consentimientoMarketing: cliente.consentimientoMarketing,
      activo: cliente.activo,
      origen: cliente.origen,
      fechaAlta: aFechaCivil(cliente.fechaAlta),
      ultimaInteraccion: cliente.ultimaInteraccionAt
        ? aFechaCivil(cliente.ultimaInteraccionAt)
        : null,
      compras: cliente.compras.map((c) => ({
        id: c.id,
        producto: c.product?.nombre ?? null,
        tituloCrudo: c.tituloCrudo,
        cantidadFrascos: c.cantidadFrascos,
        fechaCompra: aFechaCivil(c.fechaCompra),
        estadoEntrega: c.estadoEntrega,
        valorTotal: c.valorTotal,
        requiereRevision: c.requiereRevision,
        motivoRevision: c.motivoRevision,
      })),
      ciclos: cliente.ciclos.map((c) => ({
        id: c.id,
        producto: c.product.nombre,
        estado: c.estado,
        fechaInicio: aFechaCivil(c.fechaInicio),
        fechaAgotamiento: aFechaCivil(c.fechaAgotamientoEstimada),
        fechaRecompraSugerida: aFechaCivil(c.fechaRecompraSugerida),
        diasRestantes: diasRestantes(aFechaCivil(c.fechaAgotamientoEstimada), hoy),
        porcentajeRestante: porcentajeRestante(
          aFechaCivil(c.fechaInicio),
          aFechaCivil(c.fechaAgotamientoEstimada),
          hoy,
        ),
        factorAjusteAplicado: c.factorAjusteAplicado,
        intentosContacto: c.intentosContacto,
      })),
      perfiles: cliente.perfiles.map((p) => ({
        producto: p.product.nombre,
        factorAjuste: p.factorAjuste,
        dosisDiariaReal: p.dosisDiariaReal,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function PATCH(peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const datos = EsquemaClienteParcial.parse(await leerJson(peticion));

    const existente = await prisma.customer.findUnique({ where: { id } });
    if (!existente) return error('NO_ENCONTRADO', 'Ese cliente no existe.');

    const cliente = await prisma.customer.update({ where: { id }, data: datos });
    return ok(cliente);
  } catch (e) {
    return manejarError(e);
  }
}
