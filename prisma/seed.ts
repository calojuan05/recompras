/**
 * Semilla de la base.
 *
 *   npm run seed             catálogo + 50 clientes y 200 compras ficticias
 *   npm run seed:catalogo    solo catálogo, plantillas y configuración
 *
 * Los datos de demostración son inventados a propósito y con generador
 * determinista: sirven para ver la plataforma funcionando sin tocar la API y
 * sin que aparezca ningún cliente real en pantalla.
 */

import 'dotenv/config';

import { aDate, duracionEstimadaDias, hoy as hoyEnBogota, sumarDias } from '../src/lib/domain';
import { prisma } from '../src/lib/db';
import { recalcularCiclos } from '../src/lib/services/ciclos';
import { CATALOGO, PLANTILLAS } from './catalogo';

const soloCatalogo = process.argv.includes('--solo-catalogo');

/** Generador determinista: la misma semilla produce siempre los mismos datos. */
function generador(semilla: number) {
  let estado = semilla;
  return () => {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azar = generador(20260818);
const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
const elegir = <T,>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)];

const NOMBRES = [
  'María', 'José', 'Luz', 'Carlos', 'Ana', 'Jorge', 'Gloria', 'Andrés', 'Martha', 'Fernando',
  'Claudia', 'Diego', 'Patricia', 'Óscar', 'Sandra', 'Julián', 'Beatriz', 'Ricardo', 'Adriana',
  'Hernán', 'Liliana', 'Álvaro', 'Mónica', 'Camilo', 'Rocío',
];

const APELLIDOS = [
  'Giraldo', 'Rodríguez', 'Ramírez', 'Ospina', 'Cardona', 'Vargas', 'Muñoz', 'Restrepo',
  'Hurtado', 'Cárdenas', 'Salazar', 'Betancur', 'Quintero', 'Arboleda', 'Zapata', 'Mejía',
  'Palacio', 'Londoño', 'Torres', 'Vélez',
];

const CIUDADES = [
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Pereira', 'Manizales',
  'Cartagena', 'Cúcuta', 'Ibagué', 'Villavicencio', 'Armenia',
];

async function sembrarCatalogo() {
  for (const p of CATALOGO) {
    const duracion = duracionEstimadaDias(p.unidadesPorFrasco, p.dosisDiariaSugerida);

    const producto = await prisma.product.upsert({
      where: { nombre: p.nombre },
      create: {
        nombre: p.nombre,
        sku: p.sku,
        presentacion: p.presentacion,
        unidadMedida: p.unidadMedida,
        unidadesPorFrasco: p.unidadesPorFrasco,
        dosisDiariaSugerida: p.dosisDiariaSugerida,
        duracionEstimadaDias: duracion,
        precio: p.precio,
      },
      update: {},
    });

    for (const patron of p.alias) {
      await prisma.productAlias.upsert({
        where: { patron },
        create: { patron, productId: producto.id },
        update: { productId: producto.id },
      });
    }

    for (const e of p.escalas ?? []) {
      await prisma.priceScale.upsert({
        where: { productId_valor: { productId: producto.id, valor: e.valor } },
        create: { productId: producto.id, valor: e.valor, unidades: e.unidades },
        update: { unidades: e.unidades },
      });
    }
  }

  for (const t of PLANTILLAS) {
    await prisma.messageTemplate.upsert({
      where: { nombre: t.nombre },
      create: t,
      update: {},
    });
  }

  const productos = await prisma.product.count();
  const alias = await prisma.productAlias.count();
  console.log(`  Catálogo: ${productos} productos, ${alias} alias, ${PLANTILLAS.length} plantillas.`);
}

async function sembrarDemo() {
  const productos = await prisma.product.findMany({ where: { activo: true } });
  const hoy = hoyEnBogota();

  // Los clientes de demostración se marcan con el prefijo DEMO- para poder
  // borrarlos después sin arrastrar datos reales por delante.
  await prisma.customer.deleteMany({ where: { origen: 'demo' } });

  const clientes = [];
  clientes.push(
    await prisma.customer.create({
      data: {
        externalId: 'DEMO-CONTACTO',
        nombreCompleto: 'Juan Camilo Villamizar',
        telefono: '+573042360209',
        email: null,
        ciudad: 'Bogotá',
        canalPreferido: 'whatsapp',
        consentimientoMarketing: true,
        fechaAlta: aDate(sumarDias(hoy, -120)),
        ultimaInteraccionAt: aDate(sumarDias(hoy, -10)),
        origen: 'demo',
      },
    }),
  );
  for (let i = 0; i < 50; i++) {
    const nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    const telefono = `+5730${entre(10, 99)}${entre(100000, 999999)}`;
    clientes.push(
      await prisma.customer.create({
        data: {
          externalId: `DEMO-${1000 + i}`,
          nombreCompleto: nombre,
          telefono,
          email: azar() < 0.4 ? `demo${i}@ejemplo.test` : null,
          ciudad: elegir(CIUDADES),
          canalPreferido: azar() < 0.85 ? 'whatsapp' : 'email',
          // Uno de cada seis sin consentimiento: la plataforma tiene que
          // demostrar que sabe callarse con ellos.
          consentimientoMarketing: azar() > 0.17,
          fechaAlta: aDate(sumarDias(hoy, -entre(30, 300))),
          ultimaInteraccionAt: aDate(sumarDias(hoy, -entre(0, 60))),
          origen: 'demo',
        },
      }),
    );
  }

  let compras = 0;
  const objetivo = 200;

  while (compras < objetivo) {
    const cliente = elegir(clientes);
    // El colágeno domina el catálogo real; la demo refleja esa proporción.
    const producto = azar() < 0.6 ? productos[0] : elegir(productos);
    const repeticiones = azar() < 0.45 ? entre(2, 3) : 1;

    // Primera compra en algún punto de los últimos diez meses.
    let fecha = sumarDias(hoy, -entre(20, 300));

    for (let r = 0; r < repeticiones && compras < objetivo; r++) {
      const cantidad = azar() < 0.65 ? 1 : entre(2, 3);
      const claveNatural = `${cliente.id}|${producto.id}|${fecha}`;

      const existe = await prisma.purchase.findUnique({ where: { claveNatural } });
      if (!existe) {
        await prisma.purchase.create({
          data: {
            customerId: cliente.id,
            productId: producto.id,
            cantidadFrascos: cantidad,
            fechaCompra: aDate(fecha),
            fechaPedido: aDate(sumarDias(fecha, -entre(2, 5))),
            canalVenta: 'whatsapp',
            precioUnitario: producto.precio,
            valorTotal: producto.precio * cantidad,
            origen: 'manual',
            estadoEntrega: 'entregado',
            tituloCrudo: `${cantidad} x ${producto.nombre}`,
            claveNatural,
          },
        });
        compras += 1;
      }

      // La recompra siguiente cae cerca del agotamiento, con dispersión real.
      const duracion = producto.duracionEstimadaDias * cantidad;
      fecha = sumarDias(fecha, Math.max(5, Math.round(duracion * (0.7 + azar() * 0.6))));
      if (fecha > hoy) break;
    }
  }

  console.log(`  Demostración: ${clientes.length} clientes ficticios, ${compras} compras.`);
}

async function main() {
  console.log('Sembrando la base...');
  await sembrarCatalogo();

  if (!soloCatalogo) {
    await sembrarDemo();
    const resultado = await recalcularCiclos();
    console.log(
      `  Ciclos: ${resultado.ciclosCreados} creados sobre ${resultado.paresProcesados} pares cliente-producto.`,
    );

    const porEstado = await prisma.repurchaseCycle.groupBy({
      by: ['estado'],
      _count: { _all: true },
    });
    for (const fila of porEstado) {
      console.log(`    ${fila.estado.padEnd(12)} ${fila._count._all}`);
    }
  }

  console.log('Listo.');
}

main()
  .catch((error) => {
    console.error('La semilla falló:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
