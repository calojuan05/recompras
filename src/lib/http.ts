/**
 * Respuestas HTTP uniformes.
 *
 * Todos los errores salen con la misma forma { error: { code, message, details } }
 * para que la interfaz no tenga que adivinar cómo falló cada endpoint.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ErrorAdaptador } from '@/lib/adapters/tipos';
import { ErrorDominio } from '@/lib/domain';

export type CodigoError =
  | 'DATOS_INVALIDOS'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO'
  | 'REGLA_DE_NEGOCIO'
  | 'ORIGEN_EXTERNO'
  | 'ERROR_INTERNO';

const ESTADO_HTTP: Record<CodigoError, number> = {
  DATOS_INVALIDOS: 400,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  REGLA_DE_NEGOCIO: 422,
  ORIGEN_EXTERNO: 502,
  ERROR_INTERNO: 500,
};

export function ok<T>(datos: T, estado = 200) {
  return NextResponse.json(datos, { status: estado });
}

export function error(codigo: CodigoError, mensaje: string, detalles?: unknown) {
  return NextResponse.json(
    { error: { code: codigo, message: mensaje, details: detalles ?? null } },
    { status: ESTADO_HTTP[codigo] },
  );
}

/** Traduce cualquier excepción a la respuesta que le corresponde. */
export function manejarError(e: unknown) {
  if (e instanceof ZodError) {
    return error(
      'DATOS_INVALIDOS',
      'Los datos enviados no son válidos.',
      e.issues.map((i) => ({ campo: i.path.join('.') || '(raíz)', mensaje: i.message })),
    );
  }

  if (e instanceof ErrorDominio) {
    return error('REGLA_DE_NEGOCIO', e.message);
  }

  if (e instanceof ErrorAdaptador) {
    return error('ORIGEN_EXTERNO', e.message, { adaptador: e.adaptador });
  }

  const mensaje = e instanceof Error ? e.message : String(e);

  // Prisma marca la violación de índice único con P2002.
  if (typeof mensaje === 'string' && mensaje.includes('P2002')) {
    return error('CONFLICTO', 'Ya existe un registro con esos datos.');
  }

  console.error('[api] error no controlado:', e);
  return error('ERROR_INTERNO', 'Algo falló en el servidor. Revisa la consola.');
}

/** Lee el cuerpo JSON tolerando cuerpos vacíos. */
export async function leerJson(peticion: Request): Promise<unknown> {
  try {
    const texto = await peticion.text();
    return texto ? JSON.parse(texto) : {};
  } catch {
    throw new ZodError([
      {
        code: 'custom',
        path: [],
        message: 'El cuerpo de la petición no es JSON válido.',
      },
    ]);
  }
}

export interface Paginacion {
  pagina: number;
  porPagina: number;
  saltar: number;
}

export function leerPaginacion(url: URL, porPaginaPorDefecto = 25): Paginacion {
  const pagina = Math.max(1, Number(url.searchParams.get('pagina')) || 1);
  const porPagina = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('porPagina')) || porPaginaPorDefecto),
  );
  return { pagina, porPagina, saltar: (pagina - 1) * porPagina };
}
