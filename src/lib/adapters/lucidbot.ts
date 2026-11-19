/**
 * Adaptador de Lucid Bot (white-label de Chatrace).
 *
 * Particularidades del origen que este archivo absorbe para que nadie más
 * tenga que saberlas:
 *
 * - Los pedidos no viven en un endpoint de órdenes: son "opportunities" dentro
 *   de un pipeline. La etapa del pipeline es el estado de entrega.
 * - La paginación es de 100 como máximo; pedir más devuelve vacío, no error.
 * - No hay listado de contactos (/contacts responde 405). Hay que pedirlos uno
 *   por uno con el contact_id, que en esta cuenta es el teléfono.
 * - Las fechas vienen ya en hora local de la cuenta, así que se toma el día
 *   tal cual, sin convertir zonas.
 */

import { aFechaCivil, type FechaCivil } from '@/lib/domain';

import {
  ErrorAdaptador,
  type ClienteExterno,
  type CompraExterna,
  type DataSourceAdapter,
  type EstadoEntrega,
  type ProductoExterno,
} from './tipos';

interface OportunidadCruda {
  id: string;
  contact_id: string;
  title?: string;
  value?: string | number;
  created_at?: string;
  updated_at?: string;
  stage?: { id: number; name: string };
}

interface ContactoCrudo {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  subscribed?: string | number;
  last_interaction?: string | number;
  created_at?: string;
  locale?: string;
}

export interface ConfigLucidBot {
  baseUrl: string;
  token: string;
  pipelineId: string;
  /** Etapas que significan "el cliente ya lo tiene en la mano". */
  etapasEntregado: string[];
  /** Etapas que significan "volvió a la bodega". */
  etapasDevuelto: string[];
  /** Peticiones simultáneas al pedir contactos. Subirlo hace que la API corte. */
  concurrencia: number;
}

const REINTENTOS_MAXIMOS = 5;
const ESPERA_BASE_MS = 1500;
/** Respiro entre tandas de contactos, para no provocar el 429 de entrada. */
const PAUSA_ENTRE_TANDAS_MS = 250;

const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export const CONFIG_LUCIDBOT_POR_DEFECTO: ConfigLucidBot = {
  baseUrl: 'https://api.chatrace.com',
  token: '',
  pipelineId: '',
  etapasEntregado: ['Entregados'],
  etapasDevuelto: ['Devueltos'],
  concurrencia: 6,
};

export function configDesdeEntorno(): ConfigLucidBot {
  const separar = (valor: string | undefined, porDefecto: string[]) =>
    valor
      ? valor.split(',').map((s) => s.trim()).filter(Boolean)
      : porDefecto;

  return {
    baseUrl: process.env.LUCIDBOT_BASE_URL || CONFIG_LUCIDBOT_POR_DEFECTO.baseUrl,
    token: process.env.LUCIDBOT_TOKEN || '',
    pipelineId: process.env.LUCIDBOT_PIPELINE_ID || '',
    etapasEntregado: separar(process.env.LUCIDBOT_ETAPAS_ENTREGADO, ['Entregados']),
    etapasDevuelto: separar(process.env.LUCIDBOT_ETAPAS_DEVUELTO, ['Devueltos']),
    concurrencia: Number(process.env.LUCIDBOT_CONCURRENCIA) || 6,
  };
}

export class LucidBotAdapter implements DataSourceAdapter {
  readonly nombre = 'lucidbot';

  constructor(private readonly config: ConfigLucidBot) {}

  static desdeEntorno(): LucidBotAdapter {
    return new LucidBotAdapter(configDesdeEntorno());
  }

  /** ¿Hay credenciales para siquiera intentarlo? */
  get configurado(): boolean {
    return Boolean(this.config.token && this.config.pipelineId);
  }

  /**
   * La API corta con 429 cuando se le piden muchos contactos seguidos. Se
   * reintenta con espera creciente en vez de dar la sincronización por perdida:
   * quedarse a medias deja la base inconsistente hasta la próxima corrida.
   */
  private async pedir<T>(ruta: string, intento = 0): Promise<T> {
    if (!this.config.token) {
      throw new ErrorAdaptador('Falta LUCIDBOT_TOKEN en el .env', this.nombre);
    }

    const respuesta = await fetch(this.config.baseUrl + ruta, {
      headers: { 'X-ACCESS-TOKEN': this.config.token, Accept: 'application/json' },
    });

    if (respuesta.status === 429 || respuesta.status >= 500) {
      if (intento >= REINTENTOS_MAXIMOS) {
        throw new ErrorAdaptador(
          `Lucid Bot sigue respondiendo ${respuesta.status} tras ${REINTENTOS_MAXIMOS} reintentos en ${ruta}`,
          this.nombre,
        );
      }
      const cabecera = Number(respuesta.headers.get('retry-after'));
      const espera = Number.isFinite(cabecera) && cabecera > 0
        ? cabecera * 1000
        : ESPERA_BASE_MS * 2 ** intento;
      await pausa(espera);
      return this.pedir<T>(ruta, intento + 1);
    }

    if (!respuesta.ok) {
      throw new ErrorAdaptador(
        `Lucid Bot respondió ${respuesta.status} en ${ruta}`,
        this.nombre,
      );
    }

    const cuerpo = (await respuesta.json()) as T & { error?: { code: number; message: string } };
    if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && cuerpo.error) {
      throw new ErrorAdaptador(
        `Lucid Bot: ${cuerpo.error.message ?? 'error'} (${cuerpo.error.code}) en ${ruta}`,
        this.nombre,
      );
    }
    return cuerpo;
  }

  private clasificarEtapa(etapa: string | undefined): EstadoEntrega {
    const nombre = (etapa ?? '').trim();
    if (this.config.etapasEntregado.includes(nombre)) return 'entregado';
    if (this.config.etapasDevuelto.includes(nombre)) return 'devuelto';
    return 'transito';
  }

  /** Recorre el pipeline completo respetando el tope de 100 por página. */
  private async traerOportunidades(): Promise<OportunidadCruda[]> {
    const filas: OportunidadCruda[] = [];
    const vistos = new Set<string>();

    for (let offset = 0; offset < 100_000; offset += 100) {
      const json = await this.pedir<{ data?: OportunidadCruda[] }>(
        `/pipelines/${this.config.pipelineId}/opportunities?limit=100&offset=${offset}`,
      );
      const lote = json.data ?? [];
      if (lote.length === 0) break;

      let nuevos = 0;
      for (const o of lote) {
        if (vistos.has(o.id)) continue;
        vistos.add(o.id);
        filas.push(o);
        nuevos += 1;
      }
      // Si una página no aporta nada nuevo, la API está repitiéndose.
      if (lote.length < 100 || nuevos === 0) break;
    }

    return filas;
  }

  async fetchPurchases(since?: Date): Promise<CompraExterna[]> {
    const crudas = await this.traerOportunidades();
    const desde: FechaCivil | null = since ? aFechaCivil(since) : null;

    const compras: CompraExterna[] = [];
    for (const o of crudas) {
      if (!o.created_at) continue;

      const fechaPedido = aFechaCivil(o.created_at);
      if (desde && fechaPedido < desde) continue;

      const estadoEntrega = this.clasificarEtapa(o.stage?.name);
      // updated_at es cuando el pedido llegó a su etapa final: para un pedido
      // entregado, esa ES la fecha de entrega.
      const fechaEntrega =
        estadoEntrega === 'entregado' && o.updated_at ? aFechaCivil(o.updated_at) : null;

      compras.push({
        externalId: String(o.id),
        clienteExternalId: String(o.contact_id),
        titulo: o.title ?? '',
        valor: Number.parseFloat(String(o.value ?? 0)) || 0,
        fechaPedido,
        fechaEntrega,
        estadoEntrega,
        canalVenta: 'whatsapp',
      });
    }

    return compras;
  }

  async fetchCustomers(ids: string[] = []): Promise<ClienteExterno[]> {
    if (ids.length === 0) return [];

    const unicos = [...new Set(ids.filter(Boolean))];
    const clientes: ClienteExterno[] = [];

    // Pool sencillo: la API corta si se le mandan demasiadas a la vez.
    for (let i = 0; i < unicos.length; i += this.config.concurrencia) {
      const tanda = unicos.slice(i, i + this.config.concurrencia);
      const resultados = await Promise.allSettled(
        tanda.map((id) => this.pedir<ContactoCrudo>(`/contacts/${id}`)),
      );

      for (const r of resultados) {
        if (r.status !== 'fulfilled' || !r.value?.id) continue;
        clientes.push(this.aClienteExterno(r.value));
      }

      if (i + this.config.concurrencia < unicos.length) await pausa(PAUSA_ENTRE_TANDAS_MS);
    }

    return clientes;
  }

  private aClienteExterno(c: ContactoCrudo): ClienteExterno {
    const nombre =
      c.full_name?.trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
      `Contacto ${c.id}`;

    // last_interaction llega como epoch en milisegundos.
    let ultimaInteraccion: FechaCivil | null = null;
    const epoch = Number(c.last_interaction);
    if (Number.isFinite(epoch) && epoch > 0) {
      ultimaInteraccion = aFechaCivil(new Date(epoch));
    }

    return {
      externalId: String(c.id),
      nombreCompleto: nombre,
      email: c.email?.trim() || null,
      telefono: c.phone?.trim() || `+${c.id}`,
      ciudad: null, // Lucid Bot no guarda ciudad en el contacto.
      canalPreferido: 'whatsapp',
      // `subscribed` es el opt-in de WhatsApp: es el consentimiento que existe.
      consentimientoMarketing: String(c.subscribed ?? '') === '1',
      fechaAlta: c.created_at ? aFechaCivil(c.created_at) : null,
      ultimaInteraccion,
    };
  }

  /** Chatrace no tiene catálogo de productos: el catálogo se administra aquí. */
  async fetchProducts(): Promise<ProductoExterno[]> {
    return [];
  }
}
