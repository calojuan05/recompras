/**
 * Contrato de ingesta.
 *
 * Todo lo que entra a la plataforma pasa por aquí, venga de la base local, de
 * Lucid Bot, de una API REST cualquiera o de un CSV. El resto del sistema no
 * sabe de dónde salieron los datos.
 */

import type { FechaCivil } from '@/lib/domain';

export type EstadoEntrega = 'entregado' | 'transito' | 'devuelto';

export interface ClienteExterno {
  /** Identificador estable en el sistema de origen. */
  externalId: string;
  nombreCompleto: string;
  email?: string | null;
  telefono?: string | null;
  ciudad?: string | null;
  canalPreferido?: string;
  consentimientoMarketing?: boolean;
  fechaAlta?: FechaCivil | null;
  ultimaInteraccion?: FechaCivil | null;
}

export interface ProductoExterno {
  externalId?: string | null;
  nombre: string;
  sku?: string | null;
  presentacion?: string | null;
  unidadMedida?: string | null;
  unidadesPorFrasco?: number | null;
  dosisDiariaSugerida?: number | null;
  precio?: number | null;
}

export interface CompraExterna {
  externalId: string;
  clienteExternalId: string;
  /** Título crudo del pedido; se resuelve contra alias y escalas de precio. */
  titulo: string;
  valor: number;
  fechaPedido: FechaCivil;
  /** Null mientras el pedido no haya llegado a manos del cliente. */
  fechaEntrega: FechaCivil | null;
  estadoEntrega: EstadoEntrega;
  canalVenta?: string;
  /** Producto ya resuelto por el origen, si lo trae. */
  productoNombre?: string | null;
  cantidadFrascos?: number | null;
}

export interface DataSourceAdapter {
  readonly nombre: string;
  /**
   * Algunos orígenes no permiten listar todos los clientes (Lucid Bot devuelve
   * 405 en /contacts). Por eso se aceptan ids concretos: la sincronización lee
   * primero las compras y luego pide solo los contactos que necesita.
   */
  fetchCustomers(ids?: string[]): Promise<ClienteExterno[]>;
  fetchProducts(): Promise<ProductoExterno[]>;
  fetchPurchases(since?: Date): Promise<CompraExterna[]>;
}

export class ErrorAdaptador extends Error {
  constructor(
    mensaje: string,
    readonly adaptador: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAdaptador';
  }
}
