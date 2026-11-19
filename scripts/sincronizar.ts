/**
 * Sincronización desde la línea de comandos.
 *
 *   npm run sync                      trae todo desde la fuente configurada
 *   npm run sync -- --fuente=lucidbot
 *   npm run sync -- --dry-run         valida y cuenta sin escribir nada
 *   npm run sync -- --desde=2026-01-01
 *   npm run sync -- --refrescar       vuelve a pedir los contactos ya conocidos
 */

import 'dotenv/config';

import { crearAdaptador, type FuenteDatos } from '../src/lib/adapters';
import { aDate, esFechaCivil } from '../src/lib/domain';
import { prisma } from '../src/lib/db';
import { leerConfiguracion } from '../src/lib/services/configuracion';
import { sincronizar } from '../src/lib/services/sincronizacion';

function argumento(nombre: string): string | undefined {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado?.split('=').slice(1).join('=');
}

async function main() {
  const config = await leerConfiguracion();
  const fuente = (argumento('fuente') ?? config.fuenteDatos) as FuenteDatos;
  const dryRun = process.argv.includes('--dry-run');
  const refrescarClientes = process.argv.includes('--refrescar');

  const desdeTexto = argumento('desde');
  if (desdeTexto && !esFechaCivil(desdeTexto)) {
    throw new Error(`--desde debe venir como AAAA-MM-DD, llegó "${desdeTexto}"`);
  }

  console.log(`Sincronizando desde "${fuente}"${dryRun ? ' (modo prueba, no escribe)' : ''}...`);

  const adaptador = crearAdaptador(fuente);
  const resumen = await sincronizar(adaptador, {
    desde: desdeTexto ? aDate(desdeTexto) : undefined,
    dryRun,
    refrescarClientes,
  });

  console.log('');
  console.log(`  Clientes    ${resumen.clientesNuevos} nuevos, ${resumen.clientesActualizados} actualizados`);
  console.log(`  Compras     ${resumen.comprasNuevas} nuevas, ${resumen.comprasActualizadas} actualizadas, ${resumen.comprasIgnoradas} ignoradas`);
  console.log(`  Revisión    ${resumen.comprasEnRevision} pedidos no se pudieron interpretar solos`);

  if (resumen.ciclos) {
    console.log(
      `  Ciclos      ${resumen.ciclos.ciclosCreados} creados, ${resumen.ciclos.ciclosActualizados} actualizados, ${resumen.ciclos.comprasSinCiclo} compras sin ciclo`,
    );
  }

  if (resumen.errores.length > 0) {
    console.log('');
    console.log(`  ${resumen.errores.length} errores:`);
    for (const e of resumen.errores.slice(0, 10)) console.log(`    - ${e}`);
    if (resumen.errores.length > 10) console.log(`    ... y ${resumen.errores.length - 10} más`);
  }
}

main()
  .catch((error) => {
    console.error('La sincronización falló:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
