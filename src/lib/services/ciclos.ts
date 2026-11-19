/**
 * Orquestación de ciclos: toma las compras que ya están en base y deja los
 * ciclos de recompra al día.
 *
 * La estrategia es reconstruir, no parchear. Para cada par (cliente, producto)
 * se recorren sus compras en orden y se recalcula la cadena completa. Es
 * idempotente por definición: correrlo dos veces da el mismo resultado, y no
 * hay forma de que un ciclo quede huérfano tras una corrección de datos.
 */

import {
  aDate,
  aFechaCivil,
  calcularCiclo,
  calcularFactorAjuste,
  clasificarEstado,
  duracionEstimadaDias,
  ESTADOS_MANUALES,
  hoy as hoyEnBogota,
  type EstadoCiclo,
  type FechaCivil,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { auditar } from '@/lib/services/auditoria';
import { leerConfiguracion, type Configuracion } from '@/lib/services/configuracion';

export interface ResultadoRecalculo {
  paresProcesados: number;
  ciclosCreados: number;
  ciclosActualizados: number;
  ciclosEliminados: number;
  comprasSinCiclo: number;
}

export interface OpcionesRecalculo {
  customerId?: string;
  productId?: string;
  actor?: string;
}

/** Compras que pueden generar ciclo: entregadas, con producto y sin revisión pendiente. */
function filtroComprasValidas(config: Configuracion, opciones: OpcionesRecalculo) {
  return {
    productId: { not: null },
    requiereRevision: false,
    ...(config.soloEntregados ? { estadoEntrega: 'entregado' } : {}),
    ...(opciones.customerId ? { customerId: opciones.customerId } : {}),
    ...(opciones.productId ? { productId: opciones.productId } : {}),
  };
}

export async function recalcularCiclos(
  opciones: OpcionesRecalculo = {},
): Promise<ResultadoRecalculo> {
  const config = await leerConfiguracion();
  const hoy = hoyEnBogota();
  const donde = filtroComprasValidas(config, opciones);

  const pares = await prisma.purchase.groupBy({
    by: ['customerId', 'productId'],
    where: donde,
  });

  const resultado: ResultadoRecalculo = {
    paresProcesados: 0,
    ciclosCreados: 0,
    ciclosActualizados: 0,
    ciclosEliminados: 0,
    comprasSinCiclo: 0,
  };

  for (const par of pares) {
    if (!par.productId) continue;
    const parcial = await recalcularPar(par.customerId, par.productId, config, hoy, donde);
    resultado.paresProcesados += 1;
    resultado.ciclosCreados += parcial.ciclosCreados;
    resultado.ciclosActualizados += parcial.ciclosActualizados;
    resultado.ciclosEliminados += parcial.ciclosEliminados;
  }

  // Compras que quedaron fuera: sin producto reconocido o pendientes de entrega.
  resultado.comprasSinCiclo = await prisma.purchase.count({
    where: {
      ...(opciones.customerId ? { customerId: opciones.customerId } : {}),
      OR: [
        { requiereRevision: true },
        { productId: null },
        ...(config.soloEntregados ? [{ estadoEntrega: { not: 'entregado' } }] : []),
      ],
    },
  });

  return resultado;
}

async function recalcularPar(
  customerId: string,
  productId: string,
  config: Configuracion,
  hoy: FechaCivil,
  donde: Record<string, unknown>,
) {
  const salida = { ciclosCreados: 0, ciclosActualizados: 0, ciclosEliminados: 0 };

  const [producto, compras, perfil] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.purchase.findMany({
      where: { ...donde, customerId, productId },
      orderBy: { fechaCompra: 'asc' },
    }),
    prisma.consumptionProfile.findUnique({
      where: { customerId_productId: { customerId, productId } },
    }),
  ]);

  if (!producto || compras.length === 0) return salida;

  // Los ciclos de compras que dejaron de calificar (devolución, revisión) sobran.
  const idsValidos = compras.map((c) => c.id);
  const eliminados = await prisma.repurchaseCycle.deleteMany({
    where: { customerId, productId, purchaseId: { notIn: idsValidos } },
  });
  salida.ciclosEliminados += eliminados.count;

  const historial = compras.map((c) => ({
    fechaCompra: aFechaCivil(c.fechaCompra),
    cantidadFrascos: c.cantidadFrascos,
  }));

  // Una dosis real declarada a mano gana sobre cualquier inferencia: si alguien
  // se tomó el trabajo de medirla, el historial no tiene nada que corregir.
  const dosisManual = perfil?.dosisDiariaReal ?? null;
  const duracionBase = dosisManual
    ? duracionEstimadaDias(producto.unidadesPorFrasco, dosisManual)
    : producto.duracionEstimadaDias;

  const ajuste = dosisManual
    ? { factor: 1, medianaCruda: null, suficienteHistorial: false, acotado: false, razones: [] }
    : calcularFactorAjuste(historial, producto.duracionEstimadaDias);

  await prisma.consumptionProfile.upsert({
    where: { customerId_productId: { customerId, productId } },
    create: { customerId, productId, factorAjuste: ajuste.factor },
    update: { factorAjuste: ajuste.factor },
  });

  const anticipacion = producto.diasDeAnticipacion ?? config.diasDeAnticipacion;
  let agotamientoPrevio: FechaCivil | null = null;

  for (let i = 0; i < compras.length; i++) {
    const compra = compras[i];
    const esUltima = i === compras.length - 1;

    const calculado = calcularCiclo({
      fechaCompra: aFechaCivil(compra.fechaCompra),
      duracionEstimadaDias: duracionBase,
      cantidadFrascos: compra.cantidadFrascos,
      factorAjuste: ajuste.factor,
      diasDeAnticipacion: anticipacion,
      fechaAgotamientoCicloPrevio: agotamientoPrevio,
    });
    agotamientoPrevio = calculado.fechaAgotamientoEstimada;

    const existente = await prisma.repurchaseCycle.findUnique({
      where: { purchaseId: compra.id },
    });

    // Que exista una compra posterior es prueba de que este ciclo convirtió.
    const estado: EstadoCiclo = !esUltima
      ? 'RECOMPRADO'
      : existente && ESTADOS_MANUALES.includes(existente.estado as EstadoCiclo)
        ? (existente.estado as EstadoCiclo)
        : clasificarEstado(
            (existente?.estado as EstadoCiclo) ?? 'PROGRAMADO',
            {
              fechaRecompraSugerida: calculado.fechaRecompraSugerida,
              fechaAgotamientoEstimada: calculado.fechaAgotamientoEstimada,
            },
            hoy,
          );

    const convertidoAt = !esUltima ? compras[i + 1].fechaCompra : (existente?.convertidoAt ?? null);

    const datos = {
      customerId,
      productId,
      purchaseId: compra.id,
      fechaInicio: aDate(calculado.fechaInicio),
      fechaAgotamientoEstimada: aDate(calculado.fechaAgotamientoEstimada),
      fechaRecompraSugerida: aDate(calculado.fechaRecompraSugerida),
      diasDeAnticipacion: anticipacion,
      estado,
      factorAjusteAplicado: calculado.factorAjusteAplicado,
      convertidoAt,
    };

    if (existente) {
      await prisma.repurchaseCycle.update({ where: { id: existente.id }, data: datos });
      salida.ciclosActualizados += 1;
    } else {
      await prisma.repurchaseCycle.create({ data: datos });
      salida.ciclosCreados += 1;
    }
  }

  return salida;
}

/**
 * Recalculo disparado por el registro de una compra concreta. Se limita al par
 * afectado en vez de recorrer toda la base.
 */
export async function recalcularPorCompra(purchaseId: string, actor = 'sistema') {
  const compra = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!compra || !compra.productId) return null;

  const resultado = await recalcularCiclos({
    customerId: compra.customerId,
    productId: compra.productId,
    actor,
  });

  await auditar({
    entidad: 'Purchase',
    entidadId: purchaseId,
    accion: 'recalculo_ciclo',
    despues: resultado,
    actor,
  });

  return prisma.repurchaseCycle.findUnique({ where: { purchaseId } });
}
