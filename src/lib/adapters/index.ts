/**
 * Fábrica de adaptadores. El resto del sistema pide "el adaptador de tal
 * fuente" y no sabe nada de tokens ni de formas de JSON.
 */

import { CsvImportAdapter } from './csv';
import { LocalDbAdapter } from './local-db';
import { LucidBotAdapter } from './lucidbot';
import { RestApiAdapter } from './rest-api';
import { ErrorAdaptador, type DataSourceAdapter } from './tipos';

export * from './tipos';
export { CsvImportAdapter, LocalDbAdapter, LucidBotAdapter, RestApiAdapter };
export { parsearCsv } from './csv';

export type FuenteDatos = 'local' | 'lucidbot' | 'rest' | 'csv';

export const FUENTES: readonly FuenteDatos[] = ['local', 'lucidbot', 'rest', 'csv'];

export interface OpcionesFabrica {
  /** Contenido del archivo, obligatorio para la fuente csv. */
  csv?: string;
}

export function crearAdaptador(
  fuente: FuenteDatos,
  opciones: OpcionesFabrica = {},
): DataSourceAdapter {
  switch (fuente) {
    case 'local':
      return new LocalDbAdapter();
    case 'lucidbot': {
      const adaptador = LucidBotAdapter.desdeEntorno();
      if (!adaptador.configurado) {
        throw new ErrorAdaptador(
          'Faltan LUCIDBOT_TOKEN o LUCIDBOT_PIPELINE_ID en el .env',
          'lucidbot',
        );
      }
      return adaptador;
    }
    case 'rest':
      return RestApiAdapter.desdeEntorno();
    case 'csv':
      if (!opciones.csv) throw new ErrorAdaptador('No se recibió el contenido del CSV', 'csv');
      return new CsvImportAdapter(opciones.csv);
    default:
      throw new ErrorAdaptador(`Fuente de datos desconocida: ${fuente}`, 'fabrica');
  }
}
