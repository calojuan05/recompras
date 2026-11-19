/**
 * Adaptador REST genérico con mapeo declarativo.
 *
 * La idea es no volver a escribir código cuando cambie el proveedor: la forma
 * de su JSON se describe en un archivo de mapeo (ver `mapeo-ejemplo.json`) y
 * este adaptador se limita a leerlo. Si el proveedor cambia un nombre de campo,
 * se edita el mapeo, no el programa.
 */

import { aFechaCivil, esFechaCivil, type FechaCivil } from '@/lib/domain';

import {
  ErrorAdaptador,
  type ClienteExterno,
  type CompraExterna,
  type DataSourceAdapter,
  type EstadoEntrega,
  type ProductoExterno,
} from './tipos';

export interface MapeoRecurso {
  ruta: string;
  /** Propiedad que contiene el arreglo dentro de la respuesta ("data", "items"...). */
  lista?: string;
  /** destino -> ruta en el JSON de origen, con puntos ("stage.name"). */
  campos: Record<string, string>;
  /** Valor de `estadoEntrega` según lo que traiga el campo mapeado. */
  estados?: { entregado?: string[]; devuelto?: string[] };
  paginacion?: { parametroLimite: string; parametroOffset: string; tamano: number };
}

export interface MapeoRest {
  clientes?: MapeoRecurso;
  productos?: MapeoRecurso;
  compras?: MapeoRecurso;
}

export interface ConfigRest {
  baseUrl: string;
  apiKey?: string;
  /** Nombre de la cabecera de autenticación. */
  cabeceraAuth?: string;
  mapeo: MapeoRest;
}

/** Lee "stage.name" dentro de un objeto anidado. */
export function leerRuta(objeto: unknown, ruta: string): unknown {
  if (!ruta) return undefined;
  return ruta.split('.').reduce<unknown>((actual, parte) => {
    if (actual && typeof actual === 'object' && parte in (actual as Record<string, unknown>)) {
      return (actual as Record<string, unknown>)[parte];
    }
    return undefined;
  }, objeto);
}

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor);
}

function comoNumero(valor: unknown): number {
  const n = Number.parseFloat(comoTexto(valor).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function comoFecha(valor: unknown): FechaCivil | null {
  const texto = comoTexto(valor);
  if (!texto) return null;
  const recortado = texto.slice(0, 10);
  return esFechaCivil(recortado) ? recortado : null;
}

export class RestApiAdapter implements DataSourceAdapter {
  readonly nombre = 'rest';

  constructor(private readonly config: ConfigRest) {}

  static desdeEntorno(): RestApiAdapter {
    const baseUrl = process.env.REST_API_BASE_URL ?? '';
    const mapeoCrudo = process.env.REST_API_MAPEO ?? '{}';

    let mapeo: MapeoRest;
    try {
      mapeo = JSON.parse(mapeoCrudo) as MapeoRest;
    } catch {
      throw new ErrorAdaptador('REST_API_MAPEO no es JSON válido', 'rest');
    }

    return new RestApiAdapter({
      baseUrl,
      apiKey: process.env.REST_API_KEY,
      cabeceraAuth: process.env.REST_API_CABECERA ?? 'Authorization',
      mapeo,
    });
  }

  private async pedir(ruta: string): Promise<unknown> {
    if (!this.config.baseUrl) {
      throw new ErrorAdaptador('Falta REST_API_BASE_URL en el .env', this.nombre);
    }

    const cabeceras: Record<string, string> = { Accept: 'application/json' };
    if (this.config.apiKey) {
      cabeceras[this.config.cabeceraAuth ?? 'Authorization'] = this.config.apiKey;
    }

    const respuesta = await fetch(this.config.baseUrl.replace(/\/$/, '') + ruta, {
      headers: cabeceras,
    });
    if (!respuesta.ok) {
      throw new ErrorAdaptador(`El proveedor respondió ${respuesta.status} en ${ruta}`, this.nombre);
    }
    return respuesta.json();
  }

  private async traerLista(recurso: MapeoRecurso): Promise<Record<string, unknown>[]> {
    const extraer = (json: unknown): Record<string, unknown>[] => {
      const bruto = recurso.lista ? leerRuta(json, recurso.lista) : json;
      return Array.isArray(bruto) ? (bruto as Record<string, unknown>[]) : [];
    };

    if (!recurso.paginacion) {
      return extraer(await this.pedir(recurso.ruta));
    }

    const { parametroLimite, parametroOffset, tamano } = recurso.paginacion;
    const filas: Record<string, unknown>[] = [];

    for (let offset = 0; offset < 100_000; offset += tamano) {
      const separador = recurso.ruta.includes('?') ? '&' : '?';
      const url = `${recurso.ruta}${separador}${parametroLimite}=${tamano}&${parametroOffset}=${offset}`;
      const lote = extraer(await this.pedir(url));
      if (lote.length === 0) break;
      filas.push(...lote);
      if (lote.length < tamano) break;
    }

    return filas;
  }

  async fetchCustomers(): Promise<ClienteExterno[]> {
    const recurso = this.config.mapeo.clientes;
    if (!recurso) return [];

    const filas = await this.traerLista(recurso);
    const c = recurso.campos;

    return filas
      .map((fila) => ({
        externalId: comoTexto(leerRuta(fila, c.externalId)),
        nombreCompleto: comoTexto(leerRuta(fila, c.nombreCompleto)) || 'Sin nombre',
        email: comoTexto(leerRuta(fila, c.email)) || null,
        telefono: comoTexto(leerRuta(fila, c.telefono)) || null,
        ciudad: comoTexto(leerRuta(fila, c.ciudad)) || null,
        canalPreferido: comoTexto(leerRuta(fila, c.canalPreferido)) || 'whatsapp',
        consentimientoMarketing: Boolean(leerRuta(fila, c.consentimientoMarketing)),
        fechaAlta: comoFecha(leerRuta(fila, c.fechaAlta)),
      }))
      .filter((cliente) => cliente.externalId);
  }

  async fetchProducts(): Promise<ProductoExterno[]> {
    const recurso = this.config.mapeo.productos;
    if (!recurso) return [];

    const filas = await this.traerLista(recurso);
    const c = recurso.campos;

    return filas
      .map((fila) => ({
        externalId: comoTexto(leerRuta(fila, c.externalId)) || null,
        nombre: comoTexto(leerRuta(fila, c.nombre)),
        sku: comoTexto(leerRuta(fila, c.sku)) || null,
        presentacion: comoTexto(leerRuta(fila, c.presentacion)) || null,
        unidadMedida: comoTexto(leerRuta(fila, c.unidadMedida)) || null,
        unidadesPorFrasco: comoNumero(leerRuta(fila, c.unidadesPorFrasco)) || null,
        dosisDiariaSugerida: comoNumero(leerRuta(fila, c.dosisDiariaSugerida)) || null,
        precio: comoNumero(leerRuta(fila, c.precio)) || null,
      }))
      .filter((p) => p.nombre);
  }

  async fetchPurchases(since?: Date): Promise<CompraExterna[]> {
    const recurso = this.config.mapeo.compras;
    if (!recurso) return [];

    const filas = await this.traerLista(recurso);
    const c = recurso.campos;
    const entregado = recurso.estados?.entregado ?? [];
    const devuelto = recurso.estados?.devuelto ?? [];
    const desde = since ? aFechaCivil(since) : null;

    const compras: CompraExterna[] = [];
    for (const fila of filas) {
      const externalId = comoTexto(leerRuta(fila, c.externalId));
      const clienteExternalId = comoTexto(leerRuta(fila, c.clienteExternalId));
      const fechaPedido = comoFecha(leerRuta(fila, c.fechaPedido));
      if (!externalId || !clienteExternalId || !fechaPedido) continue;
      if (desde && fechaPedido < desde) continue;

      const etapa = comoTexto(leerRuta(fila, c.estadoEntrega));
      const estadoEntrega: EstadoEntrega = entregado.includes(etapa)
        ? 'entregado'
        : devuelto.includes(etapa)
          ? 'devuelto'
          : 'transito';

      const fechaEntrega =
        estadoEntrega === 'entregado'
          ? (comoFecha(leerRuta(fila, c.fechaEntrega)) ?? fechaPedido)
          : null;

      compras.push({
        externalId,
        clienteExternalId,
        titulo: comoTexto(leerRuta(fila, c.titulo)),
        valor: comoNumero(leerRuta(fila, c.valor)),
        fechaPedido,
        fechaEntrega,
        estadoEntrega,
        canalVenta: comoTexto(leerRuta(fila, c.canalVenta)) || 'api',
      });
    }

    return compras;
  }
}
