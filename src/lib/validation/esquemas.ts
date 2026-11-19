/**
 * Validación de todo lo que entra por HTTP. Un dato mal formado tiene que
 * morir aquí y no a mitad de un cálculo de fechas.
 */

import { z } from 'zod';

import { esFechaCivil, ESTADOS_CICLO, UNIDADES_MEDIDA } from '@/lib/domain';

export const fechaCivil = z
  .string()
  .refine(esFechaCivil, 'La fecha debe venir como AAAA-MM-DD y existir en el calendario.');

export const EsquemaProducto = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio.'),
  sku: z.string().trim().min(1).optional().nullable(),
  presentacion: z.string().trim().default(''),
  unidadMedida: z.enum(UNIDADES_MEDIDA as unknown as [string, ...string[]]).default('capsulas'),
  unidadesPorFrasco: z.number().positive('Las unidades por frasco deben ser mayores que cero.'),
  dosisDiariaSugerida: z.number().positive('La dosis diaria debe ser mayor que cero.'),
  diasDeAnticipacion: z.number().int().min(0).max(365).optional().nullable(),
  precio: z.number().min(0).default(0),
  activo: z.boolean().default(true),
});

export const EsquemaProductoParcial = EsquemaProducto.partial();

export const EsquemaCompra = z.object({
  customerId: z.string().min(1, 'Falta el cliente.'),
  productId: z.string().min(1, 'Falta el producto.'),
  cantidadFrascos: z.number().int().min(1).max(50).default(1),
  fechaCompra: fechaCivil,
  fechaPedido: fechaCivil.optional().nullable(),
  canalVenta: z.string().default('whatsapp'),
  precioUnitario: z.number().min(0).default(0),
  estadoEntrega: z.enum(['entregado', 'transito', 'devuelto']).default('entregado'),
});

export const EsquemaCliente = z.object({
  nombreCompleto: z.string().min(2, 'El nombre es obligatorio.'),
  email: z.email('Correo inválido.').optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  ciudad: z.string().trim().optional().nullable(),
  canalPreferido: z.enum(['whatsapp', 'email', 'sms', 'panel']).default('whatsapp'),
  consentimientoMarketing: z.boolean().default(false),
  activo: z.boolean().default(true),
});

export const EsquemaClienteParcial = EsquemaCliente.partial();

/** Acciones sobre un ciclo desde el panel. */
export const EsquemaCicloParcial = z.object({
  estado: z.enum(ESTADOS_CICLO as unknown as [string, ...string[]]).optional(),
  fechaRecompraSugerida: fechaCivil.optional(),
  diasDeAnticipacion: z.number().int().min(0).max(365).optional(),
  notas: z.string().max(1000).optional().nullable(),
});

export const EsquemaRecalculo = z.object({
  customerId: z.string().optional(),
  productId: z.string().optional(),
});

export const EsquemaSync = z.object({
  fuente: z.enum(['local', 'lucidbot', 'rest', 'csv']).optional(),
  desde: fechaCivil.optional(),
  dryRun: z.boolean().default(false),
  refrescarClientes: z.boolean().default(false),
  /** Contenido del archivo cuando la fuente es csv. */
  csv: z.string().optional(),
});

export const EsquemaConfiguracion = z.object({
  diasDeAnticipacion: z.number().int().min(0).max(365).optional(),
  diasEntreContactos: z.number().int().min(0).max(365).optional(),
  modoEnvio: z.enum(['simulado', 'real']).optional(),
  canalesActivos: z.array(z.string()).optional(),
  linkRecompra: z.string().optional(),
  fuenteDatos: z.enum(['local', 'lucidbot', 'csv']).optional(),
  soloEntregados: z.boolean().optional(),
});

export const EsquemaPlantilla = z.object({
  nombre: z.string().min(2),
  canal: z.enum(['whatsapp', 'email', 'sms', 'panel']).default('whatsapp'),
  asunto: z.string().optional().nullable(),
  cuerpo: z.string().min(5, 'El mensaje no puede estar vacío.'),
  activo: z.boolean().default(true),
});

export const EsquemaPlantillaParcial = EsquemaPlantilla.partial();

export const EsquemaDespacho = z.object({
  /** Ids concretos del outbox; si se omite, procesa todo lo pendiente. */
  ids: z.array(z.string()).optional(),
  limite: z.number().int().min(1).max(500).default(100),
});

export const EsquemaGeneracion = z.object({
  plantillaId: z.string().optional(),
  /** Solo prepara los mensajes, sin marcarlos como enviados. */
  limite: z.number().int().min(1).max(500).default(100),
});
