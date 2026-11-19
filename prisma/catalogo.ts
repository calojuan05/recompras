/**
 * Catálogo base: productos, alias y escalas de precio.
 *
 * Los alias vienen de cómo escribe realmente los títulos el bot; las escalas,
 * de los precios de la cuenta. Ambos se pueden editar después desde el panel.
 *
 * SUPUESTO: las dosis diarias son las de la etiqueta habitual de cada tipo de
 * producto, no están confirmadas con el proveedor. Es el único dato del sistema
 * que no se puede deducir de los pedidos, y de él depende toda la aritmética:
 * revísalo en Productos antes de mandar el primer mensaje.
 */

export interface ProductoSemilla {
  nombre: string;
  sku: string;
  presentacion: string;
  unidadMedida: 'capsulas' | 'gramos' | 'ml' | 'sobres';
  unidadesPorFrasco: number;
  dosisDiariaSugerida: number;
  precio: number;
  alias: string[];
  /** valor del pedido -> unidades reales */
  escalas?: Array<{ valor: number; unidades: number }>;
}

export const CATALOGO: ProductoSemilla[] = [
  {
    nombre: 'Colágeno NeoCell 500 g',
    sku: 'NEOCELL-500',
    presentacion: 'Tarro 500 g en polvo',
    unidadMedida: 'gramos',
    unidadesPorFrasco: 500,
    dosisDiariaSugerida: 10,
    precio: 74900,
    alias: ['COLAGENO', 'COLLAGEN', 'NEOCEL', 'NEOCELL', 'MULTI COLLAGEN'],
    // Escalas reales de la cuenta: el valor del pedido dice cuántas unidades lleva.
    escalas: [
      { valor: 74900, unidades: 1 },
      { valor: 114900, unidades: 2 },
      { valor: 144900, unidades: 3 },
    ],
  },
  {
    nombre: 'Berberina con Inulina 100 caps',
    sku: 'BERB-100',
    presentacion: 'Frasco 100 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 100,
    dosisDiariaSugerida: 2,
    precio: 89900,
    alias: ['BERBERINA'],
  },
  {
    nombre: 'Hair Growth 120 caps',
    sku: 'HAIR-120',
    presentacion: 'Frasco 120 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 120,
    dosisDiariaSugerida: 2,
    precio: 89900,
    alias: ['HAIR GROW', 'HAIR GROWTH'],
  },
  {
    nombre: 'Magnesium Complex 25 en 1',
    sku: 'MAG-60',
    presentacion: 'Frasco 60 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 60,
    dosisDiariaSugerida: 2,
    precio: 79900,
    alias: ['MAGNESIUM COMPLEX', 'MAGNESIO'],
  },
  {
    nombre: 'Fle-Za 1000 ml',
    sku: 'FLEZA-1000',
    presentacion: 'Botella 1000 ml',
    unidadMedida: 'ml',
    unidadesPorFrasco: 1000,
    dosisDiariaSugerida: 15,
    precio: 99900,
    alias: ['FLE-ZA', 'FLEZA'],
  },
  {
    nombre: 'Blood Sugar Complex 60 caps',
    sku: 'BSC-60',
    presentacion: 'Frasco 60 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 60,
    dosisDiariaSugerida: 2,
    precio: 89900,
    alias: ['BLOOD SUGAR'],
  },
  {
    nombre: 'Ashwagandha 100 caps',
    sku: 'ASHWA-100',
    presentacion: 'Frasco 100 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 100,
    dosisDiariaSugerida: 2,
    precio: 79900,
    alias: ['ASHWAGANDA', 'ASHWAGANDHA'],
  },
  {
    nombre: 'Creatina for Women 300 g',
    sku: 'CREA-300',
    presentacion: 'Tarro 300 g en polvo',
    unidadMedida: 'gramos',
    unidadesPorFrasco: 300,
    dosisDiariaSugerida: 5,
    precio: 89900,
    alias: ['CREATINA'],
  },
  {
    nombre: 'NAD+ Resveratrol 100 caps',
    sku: 'NAD-100',
    presentacion: 'Frasco 100 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 100,
    dosisDiariaSugerida: 2,
    precio: 129900,
    alias: ['NAD'],
  },
  {
    nombre: 'Clorofila 500 ml',
    sku: 'CLORO-500',
    presentacion: 'Botella 500 ml',
    unidadMedida: 'ml',
    unidadesPorFrasco: 500,
    dosisDiariaSugerida: 10,
    precio: 69900,
    alias: ['CLOROFILA'],
  },
  {
    nombre: 'Gluconato de Potasio 100 caps',
    sku: 'POTA-100',
    presentacion: 'Frasco 100 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 100,
    dosisDiariaSugerida: 2,
    precio: 69900,
    alias: ['GLUCONATO', 'POTASIO'],
  },
  {
    nombre: 'Cúrcuma y Pimienta Negra 100 caps',
    sku: 'CURC-100',
    presentacion: 'Frasco 100 cápsulas',
    unidadMedida: 'capsulas',
    unidadesPorFrasco: 100,
    dosisDiariaSugerida: 2,
    precio: 69900,
    alias: ['CURCUMA'],
  },
];

/**
 * Plantillas iniciales. Tono cálido y sin promesas de resultados de salud:
 * son suplementos, no medicamentos, y prometer efectos terapéuticos es un
 * problema regulatorio antes que uno de marketing.
 */
export const PLANTILLAS = [
  {
    nombre: 'Recordatorio amable',
    canal: 'whatsapp',
    asunto: null,
    // Ojo: {{dias_restantes}} ya viene redactado ("7 días", "se terminó ayer"),
    // así que la plantilla no debe repetir la palabra días.
    cuerpo:
      'Hola {{nombre}}, según nuestras cuentas tu {{producto}} está por terminarse: te quedan unos {{dias_restantes}}. Si quieres seguir sin interrupciones, aquí puedes pedirlo: {{link_recompra}}',
  },
  {
    nombre: 'Ya se le acabó',
    canal: 'whatsapp',
    asunto: null,
    cuerpo:
      'Hola {{nombre}}, calculamos que tu {{producto}} ya se terminó. Si quieres continuar, te lo dejamos listo aquí: {{link_recompra}}. Y si prefieres que no te escribamos más sobre esto, solo dinos.',
  },
  {
    nombre: 'Correo de recompra',
    canal: 'email',
    asunto: 'Tu {{producto}} está por terminarse',
    cuerpo:
      'Hola {{nombre}}:\n\nDe tu {{producto}} te quedan unos {{dias_restantes}}. Si quieres continuar sin pausas, puedes pedirlo aquí: {{link_recompra}}\n\nUn saludo.',
  },
];
