/**
 * Generación y despacho de mensajes de recompra.
 *
 * Tres barreras, en este orden, antes de que un mensaje llegue siquiera a la
 * bandeja de salida:
 *
 *   1. Consentimiento. Sin `consentimientoMarketing` no se genera nada.
 *   2. Frecuencia. Un mismo cliente no se contacta dos veces en menos de los
 *      días configurados. Un sistema de recompra sin este límite se convierte
 *      en spam y quema la base.
 *   3. Duplicados. Si ya hay un mensaje pendiente para ese ciclo, no se apila otro.
 *
 * Y una cuarta al final: en modo simulado el mensaje se marca como SIMULADO y
 * no sale hacia ningún proveedor. Es el valor por defecto a propósito.
 */

import {
  aFechaCivil,
  describirDiasRestantes,
  diasRestantes,
  hoy as hoyEnBogota,
  renderizarPlantilla,
  type FechaCivil,
} from '@/lib/domain';
import { prisma } from '@/lib/db';
import { auditar } from '@/lib/services/auditoria';
import { leerConfiguracion } from '@/lib/services/configuracion';

export interface ResumenGeneracion {
  ciclosRevisados: number;
  mensajesCreados: number;
  omitidosSinConsentimiento: number;
  omitidosPorFrecuencia: number;
  omitidosPorDuplicado: number;
  omitidosSinDestinatario: number;
}

export interface ResumenDespacho {
  procesados: number;
  simulados: number;
  enviados: number;
  fallidos: number;
  modo: 'simulado' | 'real';
}

const MS_POR_DIA = 86_400_000;

export interface PlantillaRedaccion {
  nombre: string;
  canal: string;
  cuerpo: string;
}

export interface DatosRedaccion {
  plantillas: PlantillaRedaccion[];
  canal: string;
  estado: string;
  nombreCompleto: string;
  producto: string;
  fechaAgotamiento: FechaCivil;
  linkRecompra: string;
  hoy: FechaCivil;
}

/**
 * Redacta el mensaje de un ciclo. Vive aparte porque lo usan dos caminos: el
 * job, que lo guarda en la bandeja, y el botón de WhatsApp del panel, que lo
 * deja escrito en el chat para que una persona lo revise antes de enviarlo.
 * Que ambos pasen por aquí es lo que garantiza que digan lo mismo.
 */
export function redactarMensaje(
  datos: DatosRedaccion,
): { plantilla: string; cuerpo: string } | null {
  const { plantillas, canal, estado } = datos;
  if (plantillas.length === 0) return null;

  const plantilla =
    plantillas.find((p) => p.canal === canal && esPlantillaDeEstado(p.nombre, estado)) ??
    plantillas.find((p) => p.canal === canal) ??
    plantillas[0];

  const restantes = diasRestantes(datos.fechaAgotamiento, datos.hoy);

  return {
    plantilla: plantilla.nombre,
    cuerpo: renderizarPlantilla(plantilla.cuerpo, {
      nombre: primerNombre(datos.nombreCompleto),
      producto: datos.producto,
      dias_restantes: describirDiasRestantes(restantes),
      link_recompra: datos.linkRecompra,
    }),
  };
}

/**
 * Recorre los ciclos en ventana de contacto y deja los mensajes preparados.
 * No envía: solo llena la bandeja para que una persona los apruebe.
 */
export async function generarNotificaciones(
  opciones: { limite?: number; actor?: string } = {},
): Promise<ResumenGeneracion> {
  const { limite = 200, actor = 'sistema' } = opciones;
  const config = await leerConfiguracion();
  const hoy = hoyEnBogota();

  const resumen: ResumenGeneracion = {
    ciclosRevisados: 0,
    mensajesCreados: 0,
    omitidosSinConsentimiento: 0,
    omitidosPorFrecuencia: 0,
    omitidosPorDuplicado: 0,
    omitidosSinDestinatario: 0,
  };

  const ciclos = await prisma.repurchaseCycle.findMany({
    where: { estado: { in: ['POR_VENCER', 'VENCIDO'] } },
    include: { customer: true, product: true },
    orderBy: { fechaRecompraSugerida: 'asc' },
    take: limite,
  });

  const plantillas = await prisma.messageTemplate.findMany({ where: { activo: true } });
  if (plantillas.length === 0) return resumen;

  const limiteContacto = new Date(Date.now() - config.diasEntreContactos * MS_POR_DIA);

  for (const ciclo of ciclos) {
    resumen.ciclosRevisados += 1;

    if (!ciclo.customer.consentimientoMarketing || !ciclo.customer.activo) {
      resumen.omitidosSinConsentimiento += 1;
      continue;
    }

    if (ciclo.ultimoContactoAt && ciclo.ultimoContactoAt > limiteContacto) {
      resumen.omitidosPorFrecuencia += 1;
      continue;
    }

    // El límite es por cliente, no por ciclo: si tiene tres productos a punto
    // de acabarse no se le mandan tres mensajes el mismo día.
    const contactoReciente = await prisma.notificationOutbox.findFirst({
      where: {
        cycle: { customerId: ciclo.customerId },
        estado: { in: ['SIMULADO', 'ENVIADO'] },
        enviadoAt: { gt: limiteContacto },
      },
    });
    if (contactoReciente) {
      resumen.omitidosPorFrecuencia += 1;
      continue;
    }

    const pendiente = await prisma.notificationOutbox.findFirst({
      where: { cycleId: ciclo.id, estado: 'PENDIENTE' },
    });
    if (pendiente) {
      resumen.omitidosPorDuplicado += 1;
      continue;
    }

    const canal = config.canalesActivos.includes(ciclo.customer.canalPreferido)
      ? ciclo.customer.canalPreferido
      : config.canalesActivos[0];
    if (!canal) {
      resumen.omitidosSinDestinatario += 1;
      continue;
    }

    const destinatario =
      canal === 'email' ? ciclo.customer.email : ciclo.customer.telefono;
    if (!destinatario) {
      resumen.omitidosSinDestinatario += 1;
      continue;
    }

    const redactado = redactarMensaje({
      plantillas,
      canal,
      estado: ciclo.estado,
      nombreCompleto: ciclo.customer.nombreCompleto,
      producto: ciclo.product.nombre,
      fechaAgotamiento: aFechaCivil(ciclo.fechaAgotamientoEstimada),
      linkRecompra: config.linkRecompra,
      hoy,
    });
    if (!redactado) continue;

    await prisma.notificationOutbox.create({
      data: {
        cycleId: ciclo.id,
        canal,
        plantilla: redactado.plantilla,
        destinatario,
        cuerpo: redactado.cuerpo,
        estado: 'PENDIENTE',
        programadoPara: new Date(),
      },
    });

    resumen.mensajesCreados += 1;
  }

  if (resumen.mensajesCreados > 0) {
    await auditar({
      entidad: 'NotificationOutbox',
      entidadId: 'lote',
      accion: 'generacion',
      despues: resumen,
      actor,
    });
  }

  return resumen;
}

/** Un ciclo vencido merece un texto distinto al de uno que está por vencer. */
function esPlantillaDeEstado(nombrePlantilla: string, estado: string): boolean {
  const nombre = nombrePlantilla.toLowerCase();
  if (estado === 'VENCIDO') return nombre.includes('acab');
  return !nombre.includes('acab');
}

function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] ?? nombreCompleto;
}

/**
 * Procesa la bandeja. En modo simulado marca SIMULADO y registra el momento,
 * sin llamar a ningún proveedor. En modo real, mientras no haya credenciales,
 * falla de forma explícita en vez de fingir que envió.
 */
export async function despacharOutbox(
  opciones: { ids?: string[]; limite?: number; actor?: string } = {},
): Promise<ResumenDespacho> {
  const { ids, limite = 100, actor = 'sistema' } = opciones;
  const config = await leerConfiguracion();

  const pendientes = await prisma.notificationOutbox.findMany({
    where: { estado: 'PENDIENTE', ...(ids?.length ? { id: { in: ids } } : {}) },
    take: limite,
    include: { cycle: true },
  });

  const resumen: ResumenDespacho = {
    procesados: 0,
    simulados: 0,
    enviados: 0,
    fallidos: 0,
    modo: config.modoEnvio,
  };

  for (const mensaje of pendientes) {
    resumen.procesados += 1;
    const ahora = new Date();

    if (config.modoEnvio === 'simulado') {
      await prisma.notificationOutbox.update({
        where: { id: mensaje.id },
        data: { estado: 'SIMULADO', enviadoAt: ahora, error: null },
      });
      resumen.simulados += 1;
    } else {
      const fallo = credencialesFaltantes(mensaje.canal);
      await prisma.notificationOutbox.update({
        where: { id: mensaje.id },
        data: fallo
          ? { estado: 'FALLIDO', error: fallo }
          : { estado: 'ENVIADO', enviadoAt: ahora, error: null },
      });
      if (fallo) resumen.fallidos += 1;
      else resumen.enviados += 1;
    }

    await prisma.repurchaseCycle.update({
      where: { id: mensaje.cycleId },
      data: { ultimoContactoAt: ahora, intentosContacto: { increment: 1 } },
    });
  }

  if (resumen.procesados > 0) {
    await auditar({
      entidad: 'NotificationOutbox',
      entidadId: 'lote',
      accion: 'despacho',
      despues: resumen,
      actor,
    });
  }

  return resumen;
}

/**
 * En modo real, qué falta para poder enviar de verdad. Devuelve null si el
 * canal está listo. Los proveedores concretos se conectan aquí.
 */
function credencialesFaltantes(canal: string): string | null {
  if (canal === 'whatsapp') {
    return process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID
      ? // SUPUESTO: el envío real contra WhatsApp Cloud API queda por conectar.
        // La ventana de 24 h obliga a usar plantillas aprobadas por Meta, y eso
        // se decide con el número ya verificado, no antes.
        'Modo real activo pero el envío por WhatsApp todavía no está conectado.'
      : 'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en el .env.';
  }
  if (canal === 'email') {
    return process.env.SMTP_HOST
      ? 'Modo real activo pero el envío por correo todavía no está conectado.'
      : 'Falta la configuración SMTP en el .env.';
  }
  return `El canal "${canal}" no tiene proveedor configurado.`;
}
