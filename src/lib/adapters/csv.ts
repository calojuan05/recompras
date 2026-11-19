/**
 * Importación desde CSV, con validación fila por fila.
 *
 * Dos decisiones de diseño: una fila mala no tumba la importación entera (se
 * rechaza y se reporta con su número de línea y el motivo), y existe un modo
 * de prueba que valida todo sin escribir nada. Importar a ciegas un archivo de
 * quinientas filas y descubrir después que la mitad entró mal es peor que no
 * importar.
 */

import { z } from 'zod';

import { esFechaCivil } from '@/lib/domain';

import type {
  ClienteExterno,
  CompraExterna,
  DataSourceAdapter,
  EstadoEntrega,
  ProductoExterno,
} from './tipos';

/** Parser tolerante a comillas, comas dentro de comillas y saltos de línea. */
export function parsearCsv(texto: string): { encabezados: string[]; filas: string[][] } {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];

    if (enComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') enComillas = true;
    else if (c === ',' || c === ';') {
      fila.push(campo.trim());
      campo = '';
    } else if (c === '\n') {
      fila.push(campo.trim());
      if (fila.some((v) => v !== '')) filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }

  fila.push(campo.trim());
  if (fila.some((v) => v !== '')) filas.push(fila);

  const [encabezados = [], ...resto] = filas;
  return { encabezados: encabezados.map((h) => h.trim()), filas: resto };
}

const fechaCivil = z.string().refine(esFechaCivil, 'La fecha debe venir como AAAA-MM-DD');

export const EsquemaFilaCompra = z.object({
  externalId: z.string().min(1, 'externalId es obligatorio'),
  clienteExternalId: z.string().min(1, 'clienteExternalId es obligatorio'),
  nombreCliente: z.string().optional().default(''),
  telefono: z.string().optional().default(''),
  email: z.string().optional().default(''),
  ciudad: z.string().optional().default(''),
  titulo: z.string().optional().default(''),
  valor: z.coerce.number().nonnegative('El valor no puede ser negativo').default(0),
  fechaPedido: fechaCivil,
  fechaEntrega: z.union([fechaCivil, z.literal('')]).optional().default(''),
  estadoEntrega: z.enum(['entregado', 'transito', 'devuelto']).default('entregado'),
});

export type FilaCompra = z.infer<typeof EsquemaFilaCompra>;

export interface FilaRechazada {
  linea: number;
  motivo: string;
  contenido: Record<string, string>;
}

export interface ResumenCsv {
  filasLeidas: number;
  filasValidas: number;
  rechazos: FilaRechazada[];
}

export class CsvImportAdapter implements DataSourceAdapter {
  readonly nombre = 'csv';

  private validas: FilaCompra[] = [];
  private rechazos: FilaRechazada[] = [];
  private filasLeidas = 0;

  constructor(private readonly contenido: string) {
    this.procesar();
  }

  private procesar() {
    const { encabezados, filas } = parsearCsv(this.contenido);
    this.filasLeidas = filas.length;

    filas.forEach((valores, indice) => {
      const objeto: Record<string, string> = {};
      encabezados.forEach((h, i) => {
        objeto[h] = valores[i] ?? '';
      });

      const resultado = EsquemaFilaCompra.safeParse(objeto);
      if (resultado.success) {
        this.validas.push(resultado.data);
      } else {
        this.rechazos.push({
          linea: indice + 2, // +1 por el encabezado, +1 porque los humanos cuentan desde uno
          motivo: resultado.error.issues
            .map((i) => `${i.path.join('.') || 'fila'}: ${i.message}`)
            .join('; '),
          contenido: objeto,
        });
      }
    });
  }

  get resumen(): ResumenCsv {
    return {
      filasLeidas: this.filasLeidas,
      filasValidas: this.validas.length,
      rechazos: this.rechazos,
    };
  }

  async fetchCustomers(): Promise<ClienteExterno[]> {
    const porId = new Map<string, ClienteExterno>();

    for (const fila of this.validas) {
      if (porId.has(fila.clienteExternalId)) continue;
      porId.set(fila.clienteExternalId, {
        externalId: fila.clienteExternalId,
        nombreCompleto: fila.nombreCliente || `Cliente ${fila.clienteExternalId}`,
        email: fila.email || null,
        telefono: fila.telefono || null,
        ciudad: fila.ciudad || null,
        canalPreferido: fila.telefono ? 'whatsapp' : 'email',
        // Un CSV no puede afirmar que alguien dio permiso: entra en false y se
        // marca a mano. Es la opción que no quema la base.
        consentimientoMarketing: false,
      });
    }

    return [...porId.values()];
  }

  async fetchProducts(): Promise<ProductoExterno[]> {
    return [];
  }

  async fetchPurchases(): Promise<CompraExterna[]> {
    return this.validas.map((fila) => ({
      externalId: fila.externalId,
      clienteExternalId: fila.clienteExternalId,
      titulo: fila.titulo,
      valor: fila.valor,
      fechaPedido: fila.fechaPedido,
      fechaEntrega:
        fila.estadoEntrega === 'entregado' ? fila.fechaEntrega || fila.fechaPedido : null,
      estadoEntrega: fila.estadoEntrega as EstadoEntrega,
      canalVenta: 'import',
    }));
  }
}
