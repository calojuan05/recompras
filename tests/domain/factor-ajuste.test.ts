import { describe, expect, it } from 'vitest';

import {
  acotarFactor,
  calcularFactorAjuste,
  FACTOR_MAXIMO,
  FACTOR_MINIMO,
  FACTOR_NEUTRO,
  mediana,
} from '@/lib/domain/factor-ajuste';

const DURACION = 50; // colágeno 500 g a 10 g diarios

const compra = (fechaCompra: string, cantidadFrascos = 1) => ({ fechaCompra, cantidadFrascos });

describe('mediana', () => {
  it('impar toma el central, par promedia los dos del medio', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it('no se deja arrastrar por un valor extremo', () => {
    // Un cliente que desapareció un año no debe mover el factor de los demás.
    expect(mediana([0.9, 1.0, 1.1, 12])).toBe(1.05);
  });
});

describe('historial insuficiente', () => {
  it('sin compras o con una sola, el factor es neutro', () => {
    expect(calcularFactorAjuste([], DURACION).factor).toBe(FACTOR_NEUTRO);

    const una = calcularFactorAjuste([compra('2026-01-01')], DURACION);
    expect(una.factor).toBe(FACTOR_NEUTRO);
    expect(una.suficienteHistorial).toBe(false);
  });

  it('dos pedidos del mismo día son un pedido partido, no un ciclo', () => {
    const r = calcularFactorAjuste([compra('2026-01-01'), compra('2026-01-01')], DURACION);
    expect(r.factor).toBe(FACTOR_NEUTRO);
    expect(r.razones).toHaveLength(0);
  });
});

describe('factor con historial real', () => {
  it('quien recompra cada 40 días con frascos de 50 consume más rápido', () => {
    const r = calcularFactorAjuste(
      [compra('2026-01-01'), compra('2026-02-10'), compra('2026-03-22')],
      DURACION,
    );
    expect(r.razones).toEqual([0.8, 0.8]);
    expect(r.medianaCruda).toBe(0.8);
    expect(r.factor).toBe(0.8);
    expect(r.suficienteHistorial).toBe(true);
    expect(r.acotado).toBe(false);
  });

  it('ordena el historial aunque llegue desordenado', () => {
    const desordenado = calcularFactorAjuste(
      [compra('2026-03-22'), compra('2026-01-01'), compra('2026-02-10')],
      DURACION,
    );
    expect(desordenado.factor).toBe(0.8);
  });

  it('tiene en cuenta cuántos frascos llevaba la compra anterior', () => {
    // Dos frascos rinden 100 días teóricos; recompró a los 90.
    const r = calcularFactorAjuste([compra('2026-01-01', 2), compra('2026-04-01')], DURACION);
    expect(r.razones).toEqual([0.9]);
    expect(r.factor).toBe(0.9);
  });
});

describe('límites de seguridad', () => {
  it('un consumo absurdamente rápido se acota al mínimo', () => {
    // Recompras cada 20 días sobre frascos de 50: razón 0,4.
    const r = calcularFactorAjuste(
      [compra('2026-01-01'), compra('2026-01-21'), compra('2026-02-10')],
      DURACION,
    );
    expect(r.medianaCruda).toBeCloseTo(0.4);
    expect(r.factor).toBe(FACTOR_MINIMO);
    expect(r.acotado).toBe(true);
  });

  it('un cliente que tardó el doble se acota al máximo', () => {
    // Cien días entre compras sobre frascos de 50: razón 2,0.
    const r = calcularFactorAjuste([compra('2026-01-01'), compra('2026-04-11')], DURACION);
    expect(r.medianaCruda).toBe(2);
    expect(r.factor).toBe(FACTOR_MAXIMO);
    expect(r.acotado).toBe(true);
  });

  it('acotarFactor nunca deja salir del rango', () => {
    expect(acotarFactor(0)).toBe(FACTOR_MINIMO);
    expect(acotarFactor(99)).toBe(FACTOR_MAXIMO);
    expect(acotarFactor(1.2)).toBe(1.2);
    // Ante un valor sin sentido se vuelve a lo neutro, no al extremo.
    expect(acotarFactor(Number.NaN)).toBe(FACTOR_NEUTRO);
    expect(acotarFactor(Number.POSITIVE_INFINITY)).toBe(FACTOR_NEUTRO);
  });
});
