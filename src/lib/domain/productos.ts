/**
 * De un pedido crudo de Lucid Bot a (producto, cantidad de frascos).
 *
 * Esta traducción es dominio, no infraestructura, porque de ella depende toda
 * la aritmética posterior: si la cantidad sale mal, la fecha de agotamiento se
 * desplaza un frasco entero (cincuenta días en el caso del colágeno).
 *
 * Tres cosas que hay que saber de los datos reales:
 *
 * 1. El mismo producto llega escrito de muchas formas ("NEOCEL INVIMA X 500
 *    GRAMOS", "Collagen Neocell Con Invima 500 Gr"). De ahí los alias.
 * 2. El título MIENTE sobre las cantidades: el mismo pedido de dos unidades
 *    aparece como "2 x OFERTA X2 UND" o como "1 x OFERTA X2 UND". El dato duro
 *    es el valor del pedido, y por eso las escalas de precio mandan.
 * 3. Un tercio de los pedidos llega con el título vacío. Esos no se estiman:
 *    se marcan para revisión manual.
 */

export interface AliasProducto {
  patron: string;
  productoId: string;
}

export interface EscalaPrecio {
  productoId: string;
  valor: number;
  unidades: number;
}

export interface LineaTitulo {
  packs: number;
  nombreCrudo: string;
}

export type FuenteCantidad = 'escala' | 'titulo' | 'ninguna';

export interface ResolucionCompra {
  productoId: string | null;
  cantidadFrascos: number;
  requiereRevision: boolean;
  motivoRevision: string | null;
  fuenteCantidad: FuenteCantidad;
  lineas: LineaTitulo[];
}

/** Marcas diacríticas que deja NFD al descomponer las tildes. */
const DIACRITICOS = /\p{Diacritic}/gu;

/** Mayúsculas y sin tildes, para comparar títulos escritos de cualquier manera. */
export function normalizarTexto(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toUpperCase()
    .trim();
}

/** Parte el título en líneas y separa el multiplicador del carrito del nombre. */
export function parsearTitulo(titulo: string): LineaTitulo[] {
  const limpio = (titulo ?? '').trim();
  if (!limpio) return [];

  return limpio
    .split(/\s*[;,|]\s*/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      // Quita colas de precio del tipo " - $144.900".
      let texto = parte.replace(/\s*-\s*\$[\d.,]+\s*$/, '').trim();
      let packs = 1;
      const conMultiplicador = texto.match(/^(\d+)\s*x\s*(.+)$/i);
      if (conMultiplicador) {
        packs = Number.parseInt(conMultiplicador[1], 10) || 1;
        texto = conMultiplicador[2].trim();
      }
      return { packs, nombreCrudo: texto };
    });
}

/** "OFERTA X2 UND ..." es un SKU que ya trae dos frascos dentro. */
export function unidadesPorPack(nombreCrudo: string): number {
  const n = normalizarTexto(nombreCrudo);
  const m = n.match(/\bX\s*(\d+)\s*UND\b/) || n.match(/\bX\s*(\d+)\s*UNI\b/);
  const valor = m ? Number.parseInt(m[1], 10) : 1;
  return Number.isFinite(valor) && valor > 0 ? valor : 1;
}

/** Primer alias cuyo patrón aparezca en el nombre. null si ninguno encaja. */
export function identificarProducto(
  nombreCrudo: string,
  alias: AliasProducto[],
): string | null {
  const n = normalizarTexto(nombreCrudo);
  if (!n) return null;
  // Patrones largos primero: "MAGNESIUM COMPLEX" debe ganarle a "MAGNESIUM".
  const ordenados = [...alias].sort((a, b) => b.patron.length - a.patron.length);
  for (const a of ordenados) {
    const patron = normalizarTexto(a.patron);
    if (patron && n.includes(patron)) return a.productoId;
  }
  return null;
}

export interface EntradaResolucion {
  titulo: string;
  /** Valor total del pedido. Es el dato confiable para deducir cantidades. */
  valor: number;
  alias: AliasProducto[];
  escalas: EscalaPrecio[];
}

export function resolverCompra(entrada: EntradaResolucion): ResolucionCompra {
  const { titulo, valor, alias, escalas } = entrada;
  const lineas = parsearTitulo(titulo);

  const base: ResolucionCompra = {
    productoId: null,
    cantidadFrascos: 1,
    requiereRevision: true,
    motivoRevision: null,
    fuenteCantidad: 'ninguna',
    lineas,
  };

  if (lineas.length === 0) {
    return { ...base, motivoRevision: 'El pedido llegó sin título desde Lucid Bot.' };
  }

  if (lineas.length > 1) {
    // Con dos productos distintos el valor total no dice cuántas unidades hay
    // de cada uno. Repartirlo sería inventar.
    return {
      ...base,
      motivoRevision: `El pedido tiene ${lineas.length} productos y el valor no permite repartirlos.`,
    };
  }

  const [linea] = lineas;
  const productoId = identificarProducto(linea.nombreCrudo, alias);
  if (!productoId) {
    return {
      ...base,
      motivoRevision: `Producto no reconocido: "${linea.nombreCrudo}".`,
    };
  }

  // La escala de precio manda sobre el título cuando existe.
  const valorRedondeado = Math.round(valor);
  const escala = escalas.find(
    (e) => e.productoId === productoId && e.valor === valorRedondeado,
  );
  if (escala) {
    return {
      productoId,
      cantidadFrascos: Math.max(1, escala.unidades),
      requiereRevision: false,
      motivoRevision: null,
      fuenteCantidad: 'escala',
      lineas,
    };
  }

  // Sin escala: el máximo entre el multiplicador del carrito y el del SKU.
  // Multiplicarlos inflaba la cantidad al doble o al triple.
  const cantidadFrascos = Math.max(linea.packs, unidadesPorPack(linea.nombreCrudo), 1);
  return {
    productoId,
    cantidadFrascos,
    requiereRevision: false,
    motivoRevision: null,
    fuenteCantidad: 'titulo',
    lineas,
  };
}
