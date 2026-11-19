/**
 * KPIs del panel. Todas las cuentas se hacen aquí para que el dashboard no
 * tenga lógica de negocio escondida en un componente.
 */

import {
  aDate,
  aFechaCivil,
  diasRestantes,
  ESTADOS_ABIERTOS,
  hoy as hoyEnBogota,
  inicioDeSemana,
  sumarDias,
  type FechaCivil,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { leerConfiguracion } from '@/lib/services/configuracion';
import { redactarMensaje } from '@/lib/services/notificaciones';

export interface PuntoProyeccion {
  semana: FechaCivil;
  etiqueta: string;
  ciclos: number;
  valorEstimado: number;
}

export interface FilaAccionHoy {
  cicloId: string;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  producto: string;
  estado: string;
  diasRestantes: number;
  canal: string;
  consentimiento: boolean;
  /** Mensaje ya redactado, para abrir el chat con el texto puesto. */
  mensaje: string | null;
}

export interface Metricas {
  hoy: FechaCivil;
  clientesActivos: number;
  clientesTotales: number;
  ciclosAbiertos: number;
  porVencer7: number;
  porVencer15: number;
  porVencer30: number;
  vencidosSinRecompra: number;
  /** Ya se les escribió y todavía no vuelven a comprar. */
  contactadosSinRespuesta: number;
  tasaConversion: number;
  ticketPromedioRecompra: number;
  comprasEnRevision: number;
  sinConsentimiento: number;
  mensajesPendientes: number;
  proyeccion: PuntoProyeccion[];
  accionHoy: FilaAccionHoy[];
}

const ETIQUETAS_MES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function etiquetaSemana(semana: FechaCivil): string {
  const [, mes, dia] = semana.split('-').map(Number);
  return `${dia} ${ETIQUETAS_MES[mes - 1]}`;
}

export async function calcularMetricas(): Promise<Metricas> {
  const hoy = hoyEnBogota();

  const enVentana = async (dias: number) =>
    prisma.repurchaseCycle.count({
      where: {
        estado: { in: ['PROGRAMADO', 'POR_VENCER'] },
        fechaRecompraSugerida: { gte: aDate(hoy), lte: aDate(sumarDias(hoy, dias)) },
      },
    });

  const [
    clientesTotales,
    ciclosAbiertos,
    porVencer7,
    porVencer15,
    porVencer30,
    vencidosSinRecompra,
    contactadosSinRespuesta,
    recomprados,
    comprasEnRevision,
    sinConsentimiento,
    mensajesPendientes,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.repurchaseCycle.count({ where: { estado: { in: [...ESTADOS_ABIERTOS] } } }),
    enVentana(7),
    enVentana(15),
    enVentana(30),
    prisma.repurchaseCycle.count({ where: { estado: 'VENCIDO' } }),
    prisma.repurchaseCycle.count({ where: { estado: 'CONTACTADO' } }),
    prisma.repurchaseCycle.count({ where: { estado: 'RECOMPRADO' } }),
    prisma.purchase.count({ where: { requiereRevision: true } }),
    prisma.customer.count({ where: { consentimientoMarketing: false } }),
    prisma.notificationOutbox.count({ where: { estado: 'PENDIENTE' } }),
  ]);

  const clientesActivos = (
    await prisma.repurchaseCycle.groupBy({
      by: ['customerId'],
      where: { estado: { in: [...ESTADOS_ABIERTOS] } },
    })
  ).length;

  // Un ciclo se considera convertido cuando llegó otra compra del mismo
  // producto. La tasa compara eso contra los que se quedaron sin respuesta,
  // hayan sido contactados o no.
  const denominador = recomprados + vencidosSinRecompra + contactadosSinRespuesta;
  const tasaConversion = denominador > 0 ? recomprados / denominador : 0;

  // Ticket promedio de recompra: valor de las compras que cerraron un ciclo,
  // es decir, las que no son la primera del cliente para ese producto.
  const ciclosConvertidos = await prisma.repurchaseCycle.findMany({
    where: { estado: 'RECOMPRADO' },
    select: { customerId: true, productId: true, convertidoAt: true },
  });

  let ticketPromedioRecompra = 0;
  if (ciclosConvertidos.length > 0) {
    const valores = await Promise.all(
      ciclosConvertidos.map(async (c) => {
        if (!c.convertidoAt) return null;
        const compra = await prisma.purchase.findFirst({
          where: { customerId: c.customerId, productId: c.productId, fechaCompra: c.convertidoAt },
          select: { valorTotal: true },
        });
        return compra?.valorTotal ?? null;
      }),
    );
    const validos = valores.filter((v): v is number => typeof v === 'number' && v > 0);
    if (validos.length > 0) {
      ticketPromedioRecompra = Math.round(validos.reduce((a, b) => a + b, 0) / validos.length);
    }
  }

  // Proyección de las próximas doce semanas.
  const primeraSemana = inicioDeSemana(hoy);
  const finProyeccion = sumarDias(primeraSemana, 12 * 7);

  const ciclosProyectados = await prisma.repurchaseCycle.findMany({
    where: {
      estado: { in: ['PROGRAMADO', 'POR_VENCER'] },
      fechaRecompraSugerida: { gte: aDate(primeraSemana), lt: aDate(finProyeccion) },
    },
    include: { product: { select: { precio: true } } },
  });

  const acumulado = new Map<FechaCivil, { ciclos: number; valor: number }>();
  for (let i = 0; i < 12; i++) {
    acumulado.set(sumarDias(primeraSemana, i * 7), { ciclos: 0, valor: 0 });
  }
  for (const ciclo of ciclosProyectados) {
    const semana = inicioDeSemana(aFechaCivil(ciclo.fechaRecompraSugerida));
    const punto = acumulado.get(semana);
    if (!punto) continue;
    punto.ciclos += 1;
    punto.valor += ciclo.product.precio;
  }

  const proyeccion: PuntoProyeccion[] = [...acumulado.entries()].map(([semana, datos]) => ({
    semana,
    etiqueta: etiquetaSemana(semana),
    ciclos: datos.ciclos,
    valorEstimado: Math.round(datos.valor),
  }));

  // Acción hoy: quienes entran hoy en ventana o ya se quedaron sin producto.
  const [filas, plantillas, config] = await Promise.all([
    prisma.repurchaseCycle.findMany({
      where: {
        estado: { in: ['POR_VENCER', 'VENCIDO'] },
        fechaRecompraSugerida: { lte: aDate(hoy) },
      },
      include: { customer: true, product: { select: { nombre: true } } },
      orderBy: { fechaAgotamientoEstimada: 'asc' },
      take: 25,
    }),
    prisma.messageTemplate.findMany({ where: { activo: true } }),
    leerConfiguracion(),
  ]);

  const accionHoy: FilaAccionHoy[] = filas.map((c) => {
    const agotamiento = aFechaCivil(c.fechaAgotamientoEstimada);
    const redactado = redactarMensaje({
      plantillas,
      canal: c.customer.canalPreferido,
      estado: c.estado,
      nombreCompleto: c.customer.nombreCompleto,
      producto: c.product.nombre,
      fechaAgotamiento: agotamiento,
      linkRecompra: config.linkRecompra,
      hoy,
    });

    return {
      cicloId: c.id,
      clienteId: c.customerId,
      cliente: c.customer.nombreCompleto,
      telefono: c.customer.telefono,
      producto: c.product.nombre,
      estado: c.estado,
      diasRestantes: diasRestantes(agotamiento, hoy),
      canal: c.customer.canalPreferido,
      consentimiento: c.customer.consentimientoMarketing,
      mensaje: redactado?.cuerpo ?? null,
    };
  });

  return {
    hoy,
    clientesActivos,
    clientesTotales,
    ciclosAbiertos,
    porVencer7,
    porVencer15,
    porVencer30,
    vencidosSinRecompra,
    contactadosSinRespuesta,
    tasaConversion,
    ticketPromedioRecompra,
    comprasEnRevision,
    sinConsentimiento,
    mensajesPendientes,
    proyeccion,
    accionHoy,
  };
}
