import { describe, expect, it } from 'vitest';

import { calcularCiclo, diasRestantes, porcentajeRestante } from '@/lib/domain/ciclos';
import { duracionEstimadaDias, ErrorDominio } from '@/lib/domain/duracion';

// Producto de referencia en todas las pruebas: colágeno en polvo, 500 g,
// 10 g al día = 50 días de rendimiento.
const COLAGENO = duracionEstimadaDias(500, 10);

describe('duración del envase', () => {
  it('divide contenido entre dosis', () => {
    expect(COLAGENO).toBe(50);
    expect(duracionEstimadaDias(60, 2)).toBe(30); // 60 cápsulas, 2 al día
    expect(duracionEstimadaDias(1000, 15)).toBe(66); // 1000 ml, 15 ml al día
  });

  it('redondea hacia abajo: mejor avisar un día antes que uno tarde', () => {
    expect(duracionEstimadaDias(100, 3)).toBe(33); // 33,33 -> 33
  });

  it('rechaza datos que no permiten calcular nada', () => {
    expect(() => duracionEstimadaDias(60, 0)).toThrow(ErrorDominio);
    expect(() => duracionEstimadaDias(0, 2)).toThrow(ErrorDominio);
    expect(() => duracionEstimadaDias(1, 2)).toThrow(ErrorDominio); // no llega a un día
  });
});

describe('cálculo base', () => {
  it('un frasco, sin ajuste, avisa siete días antes de que se acabe', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
    });

    expect(ciclo.diasTotales).toBe(50);
    expect(ciclo.fechaInicio).toBe('2026-08-18');
    expect(ciclo.fechaAgotamientoEstimada).toBe('2026-10-07');
    expect(ciclo.fechaRecompraSugerida).toBe('2026-09-30');
    expect(ciclo.encadenado).toBe(false);
    expect(ciclo.factorAjusteAplicado).toBe(1);
  });

  it('respeta una anticipación distinta', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 15,
    });
    expect(ciclo.fechaRecompraSugerida).toBe('2026-09-22');
  });

  it('si la anticipación supera lo que dura el frasco, el aviso se ancla al inicio', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: 5,
      cantidadFrascos: 1,
      diasDeAnticipacion: 30,
    });
    expect(ciclo.fechaRecompraSugerida).toBe('2026-08-18');
  });
});

describe('varios frascos en una misma orden', () => {
  it('se suman: el cliente consume uno tras otro, no a la vez', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 3,
      diasDeAnticipacion: 7,
    });

    expect(ciclo.diasTotales).toBe(150);
    expect(ciclo.fechaAgotamientoEstimada).toBe('2027-01-15'); // cruza el año
    expect(ciclo.fechaRecompraSugerida).toBe('2027-01-08');
  });

  it('dos frascos duran exactamente el doble que uno', () => {
    const uno = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
    });
    const dos = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 2,
      diasDeAnticipacion: 7,
    });
    expect(dos.diasTotales).toBe(uno.diasTotales * 2);
  });
});

describe('recompra anticipada', () => {
  it('el frasco nuevo empieza cuando se acaba el anterior, no el día de la compra', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-09-25', // recompra doce días antes de quedarse sin producto
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
      fechaAgotamientoCicloPrevio: '2026-10-07',
    });

    expect(ciclo.encadenado).toBe(true);
    expect(ciclo.fechaInicio).toBe('2026-10-07');
    expect(ciclo.fechaAgotamientoEstimada).toBe('2026-11-26');
    expect(ciclo.fechaRecompraSugerida).toBe('2026-11-19');
  });

  it('si el ciclo anterior ya venció, el nuevo arranca en la fecha de compra', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-10-20',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
      fechaAgotamientoCicloPrevio: '2026-10-07', // se le acabó hace trece días
    });

    expect(ciclo.encadenado).toBe(false);
    expect(ciclo.fechaInicio).toBe('2026-10-20');
    expect(ciclo.fechaAgotamientoEstimada).toBe('2026-12-09');
  });

  it('encadenar no pierde días: dos compras seguidas cubren cien días completos', () => {
    const primero = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
    });
    const segundo = calcularCiclo({
      fechaCompra: '2026-09-25',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
      fechaAgotamientoCicloPrevio: primero.fechaAgotamientoEstimada,
    });

    expect(segundo.fechaAgotamientoEstimada).toBe('2026-11-26');
  });
});

describe('factor de ajuste aplicado al ciclo', () => {
  it('un cliente que consume más rápido agota antes', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      factorAjuste: 0.8,
      diasDeAnticipacion: 7,
    });
    expect(ciclo.diasTotales).toBe(40);
    expect(ciclo.fechaAgotamientoEstimada).toBe('2026-09-27');
  });

  it('acota el factor aunque llegue fuera de rango', () => {
    const lento = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      factorAjuste: 5, // absurdo: se acota a 1,6
      diasDeAnticipacion: 7,
    });
    expect(lento.factorAjusteAplicado).toBe(1.6);
    expect(lento.diasTotales).toBe(80);

    const rapido = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      factorAjuste: 0.1, // absurdo: se acota a 0,6
      diasDeAnticipacion: 7,
    });
    expect(rapido.factorAjusteAplicado).toBe(0.6);
    expect(rapido.diasTotales).toBe(30);
  });

  it('nunca produce un ciclo de cero días', () => {
    const ciclo = calcularCiclo({
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: 1,
      cantidadFrascos: 1,
      factorAjuste: 0.6,
      diasDeAnticipacion: 0,
    });
    expect(ciclo.diasTotales).toBe(1);
  });
});

describe('entradas inválidas', () => {
  it('no acepta fechas ni cantidades imposibles', () => {
    const base = {
      fechaCompra: '2026-08-18',
      duracionEstimadaDias: COLAGENO,
      cantidadFrascos: 1,
      diasDeAnticipacion: 7,
    };
    expect(() => calcularCiclo({ ...base, fechaCompra: '18/08/2026' })).toThrow(ErrorDominio);
    expect(() => calcularCiclo({ ...base, cantidadFrascos: 0 })).toThrow(ErrorDominio);
    expect(() => calcularCiclo({ ...base, cantidadFrascos: 1.5 })).toThrow(ErrorDominio);
    expect(() => calcularCiclo({ ...base, diasDeAnticipacion: -1 })).toThrow(ErrorDominio);
    expect(() => calcularCiclo({ ...base, duracionEstimadaDias: 0 })).toThrow(ErrorDominio);
  });
});

describe('días restantes y porcentaje de frasco', () => {
  it('cuenta lo que falta y lo que se pasó', () => {
    expect(diasRestantes('2026-10-07', '2026-09-30')).toBe(7);
    expect(diasRestantes('2026-10-07', '2026-10-07')).toBe(0);
    expect(diasRestantes('2026-10-07', '2026-10-20')).toBe(-13);
  });

  it('la barra va de 100 a 0 y no se sale del rango', () => {
    expect(porcentajeRestante('2026-08-18', '2026-10-07', '2026-08-18')).toBe(100);
    expect(porcentajeRestante('2026-08-18', '2026-10-07', '2026-09-12')).toBe(50);
    expect(porcentajeRestante('2026-08-18', '2026-10-07', '2026-10-07')).toBe(0);
    expect(porcentajeRestante('2026-08-18', '2026-10-07', '2026-11-30')).toBe(0);
  });
});
