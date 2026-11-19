/**
 * Configuración global, guardada en base y editable desde el panel.
 *
 * Las credenciales NO viven aquí: van en el .env y nunca salen del servidor.
 * Aquí solo hay parámetros de operación que el equipo cambia a diario.
 */

import { prisma } from '@/lib/db';

export interface Configuracion {
  /** Días antes del agotamiento en que se sugiere la recompra. */
  diasDeAnticipacion: number;
  /** Días mínimos entre dos contactos al mismo cliente. Evita convertir esto en spam. */
  diasEntreContactos: number;
  /** simulado = el mensaje se guarda en el outbox y no sale a ningún proveedor. */
  modoEnvio: 'simulado' | 'real';
  /** Canales habilitados para generar notificaciones. */
  canalesActivos: string[];
  /** Base del enlace de recompra que se inserta en las plantillas. */
  linkRecompra: string;
  /** Adaptador de ingesta por defecto. */
  fuenteDatos: 'local' | 'lucidbot' | 'csv';
  /**
   * Si es true, solo las compras ENTREGADAS generan ciclo. En contraentrega es
   * lo correcto: un pedido en tránsito o devuelto nunca llegó a consumirse.
   */
  soloEntregados: boolean;
}

export const CONFIGURACION_POR_DEFECTO: Configuracion = {
  diasDeAnticipacion: 7,
  diasEntreContactos: 7,
  modoEnvio: 'simulado',
  canalesActivos: ['whatsapp'],
  linkRecompra: 'https://vico.com.co',
  fuenteDatos: 'lucidbot',
  soloEntregados: true,
};

type ClaveConfig = keyof Configuracion;

function deserializar(clave: ClaveConfig, valor: string): Configuracion[ClaveConfig] {
  const porDefecto = CONFIGURACION_POR_DEFECTO[clave];
  if (typeof porDefecto === 'number') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
  }
  if (typeof porDefecto === 'boolean') return valor === 'true';
  if (Array.isArray(porDefecto)) {
    try {
      const parseado: unknown = JSON.parse(valor);
      return Array.isArray(parseado) ? (parseado as string[]) : porDefecto;
    } catch {
      return porDefecto;
    }
  }
  return valor;
}

function serializar(valor: unknown): string {
  if (Array.isArray(valor)) return JSON.stringify(valor);
  return String(valor);
}

export async function leerConfiguracion(): Promise<Configuracion> {
  const filas = await prisma.setting.findMany();
  const config: Configuracion = { ...CONFIGURACION_POR_DEFECTO };

  for (const fila of filas) {
    const clave = fila.clave as ClaveConfig;
    if (!(clave in CONFIGURACION_POR_DEFECTO)) continue;
    // El cast es inevitable: la tabla guarda todo como texto.
    (config[clave] as unknown) = deserializar(clave, fila.valor);
  }

  return config;
}

export async function guardarConfiguracion(cambios: Partial<Configuracion>): Promise<Configuracion> {
  const entradas = Object.entries(cambios).filter(([clave]) => clave in CONFIGURACION_POR_DEFECTO);

  await Promise.all(
    entradas.map(([clave, valor]) =>
      prisma.setting.upsert({
        where: { clave },
        create: { clave, valor: serializar(valor) },
        update: { valor: serializar(valor) },
      }),
    ),
  );

  return leerConfiguracion();
}
