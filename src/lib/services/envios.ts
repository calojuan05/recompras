/**
 * Vigilancia de envíos a San Andrés y Providencia.
 *
 * El problema: el 13 % de los pedidos se devuelve. En las islas el transporte
 * tarda tanto que el cliente se cansa de esperar, no reclama el paquete en la
 * oficina y a los pocos días vuelve. Cuando eso pasa ya es tarde. La idea es
 * avisar mientras todavía se puede hacer algo.
 *
 * Cómo funciona la lectura, y por qué así:
 *
 * - El **listado** del pipeline da id, etapa y fechas de los 1.100 pedidos en
 *   once peticiones. Barato, se puede hacer a diario.
 * - La **dirección no viene en el listado**: hay que pedir cada pedido por
 *   separado. Pedir los 1.100 seguidos hace que la API corte el acceso — pasó
 *   mientras se investigaba esto, y dejó de responder incluso el listado.
 * - Por eso solo se pide el detalle de lo que no se conoce, con una pausa entre
 *   peticiones, y **el departamento se guarda para siempre**: la dirección de un
 *   pedido no cambia nunca.
 */

import { aFechaCivil, diferenciaDias, hoy as hoyEnBogota } from '@/lib/domain/fechas';
import { prisma } from '@/lib/db';

/** Etapas que significan "todavía no llegó". Vienen del pipeline real. */
export const ETAPAS_EN_CURSO = ['Guía generada', 'En reparto', 'En oficina'];
export const ETAPA_ENTREGADO = 'Entregados';
export const ETAPA_DEVUELTO = 'Devueltos';

/** Días desde la guía a partir de los cuales el envío se considera en riesgo. */
export const DIAS_LIMITE = 7;

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * ¿Es de las islas?
 *
 * Se mira **solo el departamento**, nunca la ciudad, y eso es a propósito: en
 * Colombia hay un "San Andrés" municipio en Santander y un "San Andrés de
 * Sotavento" en Córdoba. Filtrar por ciudad metería pedidos del continente en
 * una lista que existe para vigilar envíos a una isla.
 */
export function esDeLasIslas(departamento: string): boolean {
  const d = normalizar(departamento);
  if (!d) return false;
  return d.includes('san andres') || d.includes('providencia') || d === 'sai';
}

/**
 * Los campos que Lucid Bot mete en la descripción del pedido, en orden.
 *
 * El formato es `Clave: valor, Clave: valor, ...`, pero los valores llevan comas
 * dentro ("Cra 1 #2-3, Casa 1, Piso 1"), así que partir por comas destroza la
 * dirección. Hay que leer hasta la siguiente clave conocida.
 */
const CLAVES = [
  'Nombre',
  'Apellido',
  'Documento',
  'Productos',
  'Número de teléfono',
  'Valor total',
  'Departamento',
  'Ciudad',
  'Colonia',
  'Dirección',
  'Código Postal',
  'Notas',
  'Correo electrónico',
  'Método de pago',
];

export interface PedidoDetallado {
  nombre: string;
  telefono: string | null;
  departamento: string;
  ciudad: string | null;
  direccion: string | null;
  producto: string | null;
  valor: number;
}

/** Saca los campos de la descripción. Devuelve null si no tiene forma de pedido. */
export function leerDescripcion(descripcion: string): PedidoDetallado | null {
  if (!descripcion || !descripcion.includes('Departamento:')) return null;

  const campo = (clave: string): string => {
    const siguientes = CLAVES.filter((c) => c !== clave)
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const patron = new RegExp(
      `${clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([\\s\\S]*?)(?=,\\s*(?:${siguientes}):|$)`,
    );
    const m = descripcion.match(patron);
    return (m?.[1] ?? '').replace(/^"+|"+$/g, '').trim();
  };

  const departamento = campo('Departamento');
  if (!departamento) return null;

  const nombre = [campo('Nombre'), campo('Apellido')].filter(Boolean).join(' ').trim();
  const producto = campo('Productos').replace(/^\(|\)$/g, '').replace(/^\d+\s*x\s*Nombre producto:\s*/i, '').trim();
  const valorCrudo = campo('Valor total').replace(/[^\d.]/g, '');

  return {
    nombre: nombre || 'Sin nombre',
    telefono: campo('Número de teléfono') || null,
    departamento,
    ciudad: campo('Ciudad') || null,
    direccion: campo('Dirección') || null,
    producto: producto || null,
    valor: Number(valorCrudo) || 0,
  };
}

interface OportunidadListada {
  id: string;
  contact_id: string;
  title: string;
  value: string;
  created_at: string;
  updated_at: string;
  stage?: { id: number; name: string };
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function credenciales() {
  const token = process.env.LUCIDBOT_TOKEN;
  const pipeline = process.env.LUCIDBOT_PIPELINE_ID;
  const base = process.env.LUCIDBOT_BASE_URL || 'https://api.chatrace.com';
  if (!token || !pipeline) throw new Error('Faltan LUCIDBOT_TOKEN o LUCIDBOT_PIPELINE_ID en el .env.');
  return { token, pipeline, base };
}

/**
 * Se lanza cuando Lucid Bot acepta el token pero rechaza la petición.
 *
 * Existe para no confundir "no pude preguntar" con "no hay nada". Devolver cero
 * en silencio hace que quien mira la pantalla concluya que no hay pedidos de las
 * islas, cuando en realidad la pregunta nunca llegó a hacerse.
 */
export class ErrorLucidBot extends Error {
  constructor(
    mensaje: string,
    readonly esLimite: boolean,
  ) {
    super(mensaje);
    this.name = 'ErrorLucidBot';
  }
}

async function pedir<T>(ruta: string, intento = 0): Promise<T | null> {
  const { token, base } = credenciales();
  const r = await fetch(base + ruta, { headers: { 'X-ACCESS-TOKEN': token } });

  const j = (await r.json()) as {
    data?: T;
    error?: { code?: number; message?: string | null };
  };

  if (j?.error) {
    // Un token malo responde 401 con mensaje. Un token bueno al que le cortaron
    // el paso responde código 0 y mensaje nulo: son cosas distintas y el aviso
    // al usuario tiene que distinguirlas.
    const codigo = j.error.code ?? 0;
    if (codigo === 401) {
      throw new ErrorLucidBot('Lucid Bot rechazó la clave: revisa LUCIDBOT_TOKEN en el .env.', false);
    }

    if (intento >= 3) {
      throw new ErrorLucidBot(
        'Lucid Bot aceptó la clave pero no responde a las consultas. Suele ser el límite de peticiones de la cuenta: se libera solo, espera un rato y vuelve a intentar.',
        true,
      );
    }
    await dormir(4000 * (intento + 1));
    return pedir<T>(ruta, intento + 1);
  }

  return (j.data ?? (j as unknown as T)) ?? null;
}

export interface ResumenEnvios {
  listados: number;
  delMes: number;
  consultados: number;
  deLasIslas: number;
  nuevos: number;
  actualizados: number;
  entregados: number;
  devueltos: number;
  /** Se acabó el cupo antes de mirar todo: lo que falta queda para la próxima. */
  presupuestoAgotado: boolean;
  pendientesDeMirar: number;
  errores: string[];
}

/**
 * Tope de consultas de detalle por corrida.
 *
 * Existe porque agotar el cupo de la API deja la cuenta sin servicio un buen
 * rato — pasó construyendo esto, pidiendo los 1.100 pedidos históricos de una.
 * Con el tope, lo peor que puede pasar es que una corrida deje pedidos sin
 * mirar; la siguiente los retoma, porque lo ya consultado no se vuelve a pedir.
 *
 * Está en 100 a pedido del usuario, después de que la cuenta se quedara sin
 * servicio. Un mes ronda los cien pedidos, así que la primera corrida puede
 * quedarse corta y pedir una segunda pasada: es el precio de no arriesgar la
 * cuenta, y se paga una sola vez porque lo ya consultado no se vuelve a pedir.
 */
export const MAX_CONSULTAS = 100;

/** Primer día del mes en curso, en formato AAAA-MM-DD. */
export function inicioDelMes(hoy = hoyEnBogota()): string {
  return `${hoy.slice(0, 7)}-01`;
}

/**
 * Trae los pedidos de las islas y actualiza su estado.
 *
 * `desde` recorta por fecha de creación del pedido (AAAA-MM-DD). Sin ella
 * miraría los 1.100 históricos, que es justo lo que hace que la API corte.
 */
export async function sincronizarEnvios(opciones: {
  desde?: string;
  hasta?: string;
  pausaMs?: number;
  maxConsultas?: number;
} = {}): Promise<ResumenEnvios> {
  const { pipeline } = credenciales();
  const pausa = opciones.pausaMs ?? 600;
  const tope = opciones.maxConsultas ?? MAX_CONSULTAS;
  // Sin fecha se mira el mes en curso, nunca el histórico completo.
  const desde = opciones.desde ?? inicioDelMes();
  const resumen: ResumenEnvios = {
    listados: 0,
    delMes: 0,
    consultados: 0,
    deLasIslas: 0,
    nuevos: 0,
    actualizados: 0,
    entregados: 0,
    devueltos: 0,
    presupuestoAgotado: false,
    pendientesDeMirar: 0,
    errores: [],
  };

  // 1. El listado completo: barato y suficiente para saber etapa y fechas.
  const porId = new Map<string, OportunidadListada>();
  for (let off = 0; off < 2000; off += 100) {
    const pagina = await pedir<OportunidadListada[]>(
      `/pipelines/${pipeline}/opportunities?limit=100&offset=${off}`,
    );
    if (!pagina || pagina.length === 0) break;
    for (const o of pagina) porId.set(o.id, o);
    await dormir(pausa);
  }
  resumen.listados = porId.size;

  // Del mes pedido y nada más. Los del histórico ni se miran: son mil y pico y
  // consultarlos es exactamente lo que tumba el acceso a la API.
  const candidatos = [...porId.values()]
    .filter((o) => {
      const creado = (o.created_at ?? '').slice(0, 10);
      if (creado < desde) return false;
      if (opciones.hasta && creado > opciones.hasta) return false;
      return true;
    })
    // Del más reciente al más viejo: si el cupo se acaba, que se gaste en lo que
    // todavía está a tiempo de salvarse, no en pedidos de hace tres semanas.
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  resumen.delMes = candidatos.length;

  // 2. Lo que ya se conoce no se vuelve a preguntar: la dirección es inmutable.
  const conocidos = await prisma.envioVigilado.findMany({
    where: { idExterno: { in: candidatos.map((o) => o.id) } },
  });
  const porExterno = new Map(conocidos.map((e) => [e.idExterno, e]));

  for (const o of candidatos) {
    const etapa = o.stage?.name ?? '';
    const yaGuardado = porExterno.get(o.id);

    // A los conocidos solo se les refresca la etapa: cero peticiones extra.
    if (yaGuardado) {
      const entregado = etapa === ETAPA_ENTREGADO;
      const devuelto = etapa === ETAPA_DEVUELTO;
      if (yaGuardado.etapa !== etapa) {
        await prisma.envioVigilado.update({
          where: { id: yaGuardado.id },
          data: {
            etapa,
            revisadoAt: new Date(),
            entregadoAt: entregado ? new Date(o.updated_at) : null,
            devueltoAt: devuelto ? new Date(o.updated_at) : null,
          },
        });
        resumen.actualizados += 1;
      } else {
        await prisma.envioVigilado.update({
          where: { id: yaGuardado.id },
          data: { revisadoAt: new Date() },
        });
      }
      if (entregado) resumen.entregados += 1;
      if (devuelto) resumen.devueltos += 1;
      continue;
    }

    // 3. Solo aquí se gasta una petición: pedido nuevo, hay que ver de dónde es.
    //    Si se acabó el cupo se para en seco y lo que falte espera a la próxima
    //    corrida; quedarse sin API es peor que tardar un día más en saberlo.
    if (resumen.consultados >= tope) {
      resumen.presupuestoAgotado = true;
      resumen.pendientesDeMirar += 1;
      continue;
    }

    const detalle = await pedir<{ description?: string }>(
      `/pipelines/${pipeline}/opportunities/${o.id}`,
    );
    resumen.consultados += 1;
    await dormir(pausa);

    if (!detalle?.description) {
      resumen.errores.push(`Pedido ${o.id}: la API no devolvió la descripción.`);
      continue;
    }

    const datos = leerDescripcion(detalle.description);
    if (!datos || !esDeLasIslas(datos.departamento)) continue;

    resumen.deLasIslas += 1;
    const entregado = etapa === ETAPA_ENTREGADO;
    const devuelto = etapa === ETAPA_DEVUELTO;

    await prisma.envioVigilado.create({
      data: {
        idExterno: o.id,
        contactoId: o.contact_id,
        nombre: datos.nombre,
        telefono: datos.telefono,
        departamento: datos.departamento,
        ciudad: datos.ciudad,
        direccion: datos.direccion,
        producto: datos.producto ?? o.title,
        valor: datos.valor || Number(o.value) || 0,
        etapa,
        // El reloj arranca cuando se creó el pedido en Lucid Bot. Es lo más
        // cercano a "cuándo se generó la guía" que la API deja saber hacia atrás.
        guiaGeneradaAt: new Date(o.created_at),
        entregadoAt: entregado ? new Date(o.updated_at) : null,
        devueltoAt: devuelto ? new Date(o.updated_at) : null,
      },
    });
    resumen.nuevos += 1;
    if (entregado) resumen.entregados += 1;
    if (devuelto) resumen.devueltos += 1;
  }

  return resumen;
}

export interface EnvioEnPantalla {
  id: string;
  idExterno: string;
  nombre: string;
  telefono: string | null;
  ciudad: string | null;
  direccion: string | null;
  producto: string | null;
  valor: number;
  etapa: string;
  dias: number;
  enRiesgo: boolean;
  resuelto: 'entregado' | 'devuelto' | null;
  fechaGuia: string;
}

/** Todo lo vigilado, con los días ya contados. */
export async function listarEnvios(): Promise<EnvioEnPantalla[]> {
  const filas = await prisma.envioVigilado.findMany({ orderBy: { guiaGeneradaAt: 'asc' } });
  const hoy = hoyEnBogota();

  return filas.map((e) => {
    const fechaGuia = aFechaCivil(e.guiaGeneradaAt);
    const resuelto = e.entregadoAt ? 'entregado' : e.devueltoAt ? 'devuelto' : null;
    // Un pedido resuelto deja de contar: los días se congelan el día que llegó.
    const hasta = e.entregadoAt
      ? aFechaCivil(e.entregadoAt)
      : e.devueltoAt
        ? aFechaCivil(e.devueltoAt)
        : hoy;

    const dias = diferenciaDias(fechaGuia, hasta);
    return {
      id: e.id,
      idExterno: e.idExterno,
      nombre: e.nombre,
      telefono: e.telefono,
      ciudad: e.ciudad,
      direccion: e.direccion,
      producto: e.producto,
      valor: e.valor,
      etapa: e.etapa,
      dias,
      enRiesgo: resuelto === null && dias >= DIAS_LIMITE,
      resuelto,
      fechaGuia,
    };
  });
}
