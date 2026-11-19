/**
 * Adaptador sobre la propia base. Es el que usa la plataforma cuando los datos
 * ya están cargados (semilla, importación previa o registro manual) y sirve de
 * referencia de lo que debe devolver cualquier otro adaptador.
 */

import { aFechaCivil } from '@/lib/domain';
import { prisma } from '@/lib/db';

import type {
  ClienteExterno,
  CompraExterna,
  DataSourceAdapter,
  EstadoEntrega,
  ProductoExterno,
} from './tipos';

export class LocalDbAdapter implements DataSourceAdapter {
  readonly nombre = 'local';

  async fetchCustomers(ids?: string[]): Promise<ClienteExterno[]> {
    const clientes = await prisma.customer.findMany({
      where: ids?.length ? { externalId: { in: ids } } : undefined,
    });

    return clientes.map((c) => ({
      externalId: c.externalId ?? c.id,
      nombreCompleto: c.nombreCompleto,
      email: c.email,
      telefono: c.telefono,
      ciudad: c.ciudad,
      canalPreferido: c.canalPreferido,
      consentimientoMarketing: c.consentimientoMarketing,
      fechaAlta: aFechaCivil(c.fechaAlta),
      ultimaInteraccion: c.ultimaInteraccionAt ? aFechaCivil(c.ultimaInteraccionAt) : null,
    }));
  }

  async fetchProducts(): Promise<ProductoExterno[]> {
    const productos = await prisma.product.findMany();
    return productos.map((p) => ({
      externalId: p.id,
      nombre: p.nombre,
      sku: p.sku,
      presentacion: p.presentacion,
      unidadMedida: p.unidadMedida,
      unidadesPorFrasco: p.unidadesPorFrasco,
      dosisDiariaSugerida: p.dosisDiariaSugerida,
      precio: p.precio,
    }));
  }

  async fetchPurchases(since?: Date): Promise<CompraExterna[]> {
    const compras = await prisma.purchase.findMany({
      where: since ? { fechaCompra: { gte: since } } : undefined,
      include: { customer: true, product: true },
    });

    return compras.map((c) => ({
      externalId: c.externalId ?? c.id,
      clienteExternalId: c.customer.externalId ?? c.customerId,
      titulo: c.tituloCrudo ?? c.product?.nombre ?? '',
      valor: c.valorTotal,
      fechaPedido: aFechaCivil(c.fechaPedido ?? c.fechaCompra),
      fechaEntrega: c.estadoEntrega === 'entregado' ? aFechaCivil(c.fechaCompra) : null,
      estadoEntrega: c.estadoEntrega as EstadoEntrega,
      canalVenta: c.canalVenta,
      productoNombre: c.product?.nombre ?? null,
      cantidadFrascos: c.cantidadFrascos,
    }));
  }
}
