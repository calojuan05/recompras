/**
 * Ingesta. Trae datos de un adaptador y los deja en la base sin duplicar nada.
 *
 * Idempotencia en dos niveles: primero por `externalId` (el id del pedido en el
 * origen, que es estable), y si el origen no tiene uno, por la clave natural
 * cliente + producto + fecha. Correr la sincronización diez veces seguidas deja
 * la base exactamente igual que correrla una vez.
 *
 * Un detalle que importa en contraentrega: un pedido cambia de fecha efectiva
 * cuando pasa de "en tránsito" a "entregado". Por eso la ingesta actualiza los
 * pedidos que ya conocía en vez de ignorarlos.
 */

import { aDate, resolverCompra, type AliasProducto, type EscalaPrecio } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { auditar } from '@/lib/services/auditoria';
import { recalcularCiclos, type ResultadoRecalculo } from '@/lib/services/ciclos';
import type { ClienteExterno, CompraExterna, DataSourceAdapter } from '@/lib/adapters/tipos';

export interface OpcionesSync {
  desde?: Date;
  /** Valida y cuenta todo sin escribir una sola fila. */
  dryRun?: boolean;
  /** Vuelve a pedir al origen los clientes que ya están en base. */
  refrescarClientes?: boolean;
  actor?: string;
}

export interface ResumenSync {
  adaptador: string;
  dryRun: boolean;
  clientesNuevos: number;
  clientesActualizados: number;
  comprasNuevas: number;
  comprasActualizadas: number;
  comprasIgnoradas: number;
  comprasEnRevision: number;
  errores: string[];
  ciclos: ResultadoRecalculo | null;
}

const RESULTADO_VACIO: ResultadoRecalculo = {
  paresProcesados: 0,
  ciclosCreados: 0,
  ciclosActualizados: 0,
  ciclosEliminados: 0,
  comprasSinCiclo: 0,
};

export async function sincronizar(
  adaptador: DataSourceAdapter,
  opciones: OpcionesSync = {},
): Promise<ResumenSync> {
  const { desde, dryRun = false, refrescarClientes = false, actor = 'sistema' } = opciones;

  const resumen: ResumenSync = {
    adaptador: adaptador.nombre,
    dryRun,
    clientesNuevos: 0,
    clientesActualizados: 0,
    comprasNuevas: 0,
    comprasActualizadas: 0,
    comprasIgnoradas: 0,
    comprasEnRevision: 0,
    errores: [],
    ciclos: null,
  };

  const compras = await adaptador.fetchPurchases(desde);
  if (compras.length === 0) {
    resumen.ciclos = RESULTADO_VACIO;
    return resumen;
  }

  const idsClientes = [...new Set(compras.map((c) => c.clienteExternalId).filter(Boolean))];

  const existentes = await prisma.customer.findMany({
    where: { externalId: { in: idsClientes } },
    select: { id: true, externalId: true },
  });
  const mapaClientes = new Map(existentes.map((c) => [c.externalId!, c.id]));

  // Pedir solo los contactos que faltan: en Lucid Bot cada contacto es una
  // petición aparte y hay cientos.
  const porTraer = refrescarClientes
    ? idsClientes
    : idsClientes.filter((id) => !mapaClientes.has(id));

  let clientesExternos: ClienteExterno[] = [];
  if (porTraer.length > 0) {
    try {
      clientesExternos = await adaptador.fetchCustomers(porTraer);
    } catch (error) {
      resumen.errores.push(
        `No se pudieron traer los contactos: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  await guardarClientes(clientesExternos, mapaClientes, resumen, dryRun);

  // Un pedido cuyo contacto no se pudo traer no se descarta: se crea un cliente
  // mínimo con el identificador, que en esta cuenta es el teléfono.
  const sinFicha = idsClientes.filter((id) => !mapaClientes.has(id));
  if (sinFicha.length > 0) {
    await guardarClientes(
      sinFicha.map((id) => ({
        externalId: id,
        nombreCompleto: `Contacto ${id}`,
        telefono: id.startsWith('+') ? id : `+${id}`,
        consentimientoMarketing: false,
      })),
      mapaClientes,
      resumen,
      dryRun,
    );
  }

  const [alias, escalas] = await Promise.all([
    prisma.productAlias.findMany(),
    prisma.priceScale.findMany(),
  ]);
  const aliasDominio: AliasProducto[] = alias.map((a) => ({
    patron: a.patron,
    productoId: a.productId,
  }));
  const escalasDominio: EscalaPrecio[] = escalas.map((e) => ({
    productoId: e.productId,
    valor: e.valor,
    unidades: e.unidades,
  }));

  for (const compra of compras) {
    try {
      await guardarCompra(compra, mapaClientes, aliasDominio, escalasDominio, resumen, dryRun);
    } catch (error) {
      resumen.errores.push(
        `Pedido ${compra.externalId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!dryRun) {
    resumen.ciclos = await recalcularCiclos({ actor });
    await auditar({
      entidad: 'Sync',
      entidadId: adaptador.nombre,
      accion: 'sincronizacion',
      despues: resumen,
      actor,
    });
  } else {
    resumen.ciclos = RESULTADO_VACIO;
  }

  return resumen;
}

async function guardarClientes(
  clientes: ClienteExterno[],
  mapa: Map<string, string>,
  resumen: ResumenSync,
  dryRun: boolean,
) {
  for (const c of clientes) {
    if (!c.externalId) continue;

    if (dryRun) {
      if (mapa.has(c.externalId)) resumen.clientesActualizados += 1;
      else {
        resumen.clientesNuevos += 1;
        mapa.set(c.externalId, `dry-${c.externalId}`);
      }
      continue;
    }

    const datos = {
      nombreCompleto: c.nombreCompleto,
      email: c.email ?? null,
      telefono: c.telefono ?? null,
      ciudad: c.ciudad ?? null,
      canalPreferido: c.canalPreferido ?? 'whatsapp',
      consentimientoMarketing: c.consentimientoMarketing ?? false,
      ultimaInteraccionAt: c.ultimaInteraccion ? aDate(c.ultimaInteraccion) : null,
      origen: 'api',
    };

    const existente = mapa.get(c.externalId);
    if (existente) {
      await prisma.customer.update({ where: { id: existente }, data: datos });
      resumen.clientesActualizados += 1;
    } else {
      const creado = await prisma.customer.create({
        data: {
          externalId: c.externalId,
          ...datos,
          fechaAlta: c.fechaAlta ? aDate(c.fechaAlta) : new Date(),
        },
      });
      mapa.set(c.externalId, creado.id);
      resumen.clientesNuevos += 1;
    }
  }
}

async function guardarCompra(
  compra: CompraExterna,
  mapaClientes: Map<string, string>,
  alias: AliasProducto[],
  escalas: EscalaPrecio[],
  resumen: ResumenSync,
  dryRun: boolean,
) {
  const customerId = mapaClientes.get(compra.clienteExternalId);
  if (!customerId) {
    resumen.comprasIgnoradas += 1;
    return;
  }

  const resolucion = resolverCompra({
    titulo: compra.titulo,
    valor: compra.valor,
    alias,
    escalas,
  });

  if (resolucion.requiereRevision) resumen.comprasEnRevision += 1;

  // En contraentrega el consumo empieza el día de la entrega. Mientras el
  // pedido no llegue, la fecha del pedido sirve de marcador y no genera ciclo.
  const fechaCompra = compra.fechaEntrega ?? compra.fechaPedido;
  const claveNatural = `${customerId}|${resolucion.productoId ?? 'sin-producto'}|${fechaCompra}`;

  const datos = {
    customerId,
    productId: resolucion.productoId,
    cantidadFrascos: resolucion.cantidadFrascos,
    fechaCompra: aDate(fechaCompra),
    fechaPedido: aDate(compra.fechaPedido),
    canalVenta: compra.canalVenta ?? 'whatsapp',
    valorTotal: compra.valor,
    precioUnitario: resolucion.cantidadFrascos > 0 ? compra.valor / resolucion.cantidadFrascos : 0,
    origen: 'api',
    estadoEntrega: compra.estadoEntrega,
    tituloCrudo: compra.titulo,
    requiereRevision: resolucion.requiereRevision,
    motivoRevision: resolucion.motivoRevision,
    claveNatural,
  };

  if (dryRun) {
    const existe = await prisma.purchase.findFirst({
      where: { OR: [{ externalId: compra.externalId }, { claveNatural }] },
      select: { id: true },
    });
    if (existe) resumen.comprasActualizadas += 1;
    else resumen.comprasNuevas += 1;
    return;
  }

  const existente = await prisma.purchase.findFirst({
    where: { OR: [{ externalId: compra.externalId }, { claveNatural }] },
  });

  if (existente) {
    await prisma.purchase.update({
      where: { id: existente.id },
      data: { ...datos, externalId: compra.externalId },
    });
    resumen.comprasActualizadas += 1;
  } else {
    await prisma.purchase.create({ data: { ...datos, externalId: compra.externalId } });
    resumen.comprasNuevas += 1;
  }
}
