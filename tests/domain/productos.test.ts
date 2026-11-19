import { describe, expect, it } from 'vitest';

import {
  identificarProducto,
  normalizarTexto,
  parsearTitulo,
  resolverCompra,
  unidadesPorPack,
  type AliasProducto,
  type EscalaPrecio,
} from '@/lib/domain/productos';

const ALIAS: AliasProducto[] = [
  { patron: 'COLAGENO', productoId: 'colageno' },
  { patron: 'COLLAGEN', productoId: 'colageno' },
  { patron: 'NEOCEL', productoId: 'colageno' },
  { patron: 'BERBERINA', productoId: 'berberina' },
  { patron: 'MAGNESIUM', productoId: 'magnesio' },
  { patron: 'MAGNESIUM COMPLEX', productoId: 'magnesio-complex' },
];

// Escala real de la cuenta: el valor del pedido dice cuántas unidades lleva.
const ESCALAS: EscalaPrecio[] = [
  { productoId: 'colageno', valor: 74900, unidades: 1 },
  { productoId: 'colageno', valor: 114900, unidades: 2 },
  { productoId: 'colageno', valor: 144900, unidades: 3 },
];

describe('normalización de texto', () => {
  it('quita tildes y sube a mayúsculas', () => {
    expect(normalizarTexto('Colágeno NeoCell')).toBe('COLAGENO NEOCELL');
    expect(normalizarTexto('  cúrcuma  ')).toBe('CURCUMA');
    expect(normalizarTexto('')).toBe('');
  });
});

describe('lectura del título', () => {
  it('separa el multiplicador del nombre', () => {
    expect(parsearTitulo('2 x COLAGENO NEOCELL X 500 GRS')).toEqual([
      { packs: 2, nombreCrudo: 'COLAGENO NEOCELL X 500 GRS' },
    ]);
  });

  it('un título vacío no produce líneas', () => {
    expect(parsearTitulo('')).toEqual([]);
    expect(parsearTitulo('   ')).toEqual([]);
  });

  it('quita la cola de precio', () => {
    expect(parsearTitulo('1 x BERBERINA X 100 CAPS - $74.900')).toEqual([
      { packs: 1, nombreCrudo: 'BERBERINA X 100 CAPS' },
    ]);
  });

  it('reconoce varios productos en un mismo pedido', () => {
    expect(parsearTitulo('1 x BERBERINA X 100 CAPS; 2 x COLAGENO NEOCELL')).toHaveLength(2);
  });

  it('detecta los SKU que ya traen varias unidades dentro', () => {
    expect(unidadesPorPack('OFERTA X2 UND COLAGENO NEOCELL X 500 GRS')).toBe(2);
    expect(unidadesPorPack('COLAGENO NEOCELL X 500 GRS')).toBe(1);
  });
});

describe('identificación del producto', () => {
  it('reconoce las variantes con que llega escrito el mismo producto', () => {
    expect(identificarProducto('COLAGENO NEOCELL X 500 GRS', ALIAS)).toBe('colageno');
    expect(identificarProducto('NEOCEL INVIMA X 500 GRAMOS', ALIAS)).toBe('colageno');
    expect(identificarProducto('Collagen Neocell Con Invima 500 Gr', ALIAS)).toBe('colageno');
  });

  it('el patrón más específico gana', () => {
    expect(identificarProducto('MAGNESIUM COMPLEX 25 EN 1', ALIAS)).toBe('magnesio-complex');
  });

  it('devuelve null cuando no reconoce nada', () => {
    expect(identificarProducto('PRODUCTO NUEVO SIN ALIAS', ALIAS)).toBeNull();
  });
});

describe('resolución de una compra completa', () => {
  const resolver = (titulo: string, valor: number) =>
    resolverCompra({ titulo, valor, alias: ALIAS, escalas: ESCALAS });

  it('la escala de precio manda sobre lo que diga el título', () => {
    // El caso que rompía la contabilidad: el título dice "2 x" pero son 2 unidades,
    // no 4. El valor del pedido lo resuelve sin ambigüedad.
    const r = resolver('2 x OFERTA X2 UND COLAGENO NEOCELL X 500 GRS', 114900);
    expect(r.productoId).toBe('colageno');
    expect(r.cantidadFrascos).toBe(2);
    expect(r.fuenteCantidad).toBe('escala');
    expect(r.requiereRevision).toBe(false);
  });

  it('sin escala, toma el máximo entre carrito y SKU, no el producto', () => {
    const r = resolver('2 x OFERTA X2 UND COLAGENO NEOCELL X 500 GRS', 99999);
    expect(r.cantidadFrascos).toBe(2); // no 4
    expect(r.fuenteCantidad).toBe('titulo');
  });

  it('un pedido simple de una unidad', () => {
    const r = resolver('1 x NEOCEL INVIMA X 500 GRAMOS', 74900);
    expect(r.productoId).toBe('colageno');
    expect(r.cantidadFrascos).toBe(1);
  });

  it('tres unidades por valor', () => {
    const r = resolver('3 x COLAGENO NEOCELL X 500 GRS', 144900);
    expect(r.cantidadFrascos).toBe(3);
    expect(r.fuenteCantidad).toBe('escala');
  });

  it('un pedido sin título va a revisión manual, no a una estimación a ciegas', () => {
    const r = resolver('', 74900);
    expect(r.requiereRevision).toBe(true);
    expect(r.productoId).toBeNull();
    expect(r.motivoRevision).toContain('sin título');
  });

  it('un pedido con dos productos va a revisión: el valor total no se puede repartir', () => {
    const r = resolver('1 x BERBERINA X 100 CAPS; 2 x COLAGENO NEOCELL', 189800);
    expect(r.requiereRevision).toBe(true);
    expect(r.motivoRevision).toContain('2 productos');
  });

  it('un producto que no está en el catálogo va a revisión con el nombre crudo', () => {
    const r = resolver('1 x PRODUCTO QUE NO EXISTE', 50000);
    expect(r.requiereRevision).toBe(true);
    expect(r.motivoRevision).toContain('PRODUCTO QUE NO EXISTE');
  });
});
