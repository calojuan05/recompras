import { describe, expect, it } from 'vitest';

import {
  aDate,
  aFechaCivil,
  diferenciaDias,
  esFechaCivil,
  formatearFecha,
  hoy,
  inicioDeSemana,
  maxFecha,
  minFecha,
  sumarDias,
  ZONA_HORARIA,
} from '@/lib/domain/fechas';

describe('validación de fechas civiles', () => {
  it('acepta fechas bien formadas', () => {
    expect(esFechaCivil('2026-08-18')).toBe(true);
    expect(esFechaCivil('2028-02-29')).toBe(true); // 2028 es bisiesto
  });

  it('rechaza fechas imposibles aunque tengan el formato correcto', () => {
    expect(esFechaCivil('2026-02-30')).toBe(false);
    expect(esFechaCivil('2026-13-01')).toBe(false);
    expect(esFechaCivil('2026-02-29')).toBe(false); // 2026 no es bisiesto
    expect(esFechaCivil('18/08/2026')).toBe(false);
    expect(esFechaCivil(null)).toBe(false);
  });
});

describe('aritmética de fechas — cambio de mes y de año', () => {
  it('cruza el fin de mes', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-04-30', 1)).toBe('2026-05-01');
  });

  it('cruza febrero según sea bisiesto o no', () => {
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('cruza el fin de año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-12-25', 10)).toBe('2027-01-04');
    expect(sumarDias('2027-01-04', -10)).toBe('2026-12-25');
  });

  it('un ciclo largo que arranca en agosto termina el año siguiente', () => {
    // 3 frascos de colágeno (50 días cada uno) comprados el 18 de agosto.
    expect(sumarDias('2026-08-18', 150)).toBe('2027-01-15');
  });

  it('mide diferencias en ambos sentidos', () => {
    expect(diferenciaDias('2026-08-18', '2026-10-07')).toBe(50);
    expect(diferenciaDias('2026-10-07', '2026-08-18')).toBe(-50);
    expect(diferenciaDias('2026-12-31', '2027-01-01')).toBe(1);
    expect(diferenciaDias('2026-01-01', '2027-01-01')).toBe(365);
    expect(diferenciaDias('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('compara y ordena', () => {
    expect(maxFecha('2026-08-18', '2026-10-07')).toBe('2026-10-07');
    expect(minFecha('2026-08-18', '2026-10-07')).toBe('2026-08-18');
  });
});

describe('zona horaria de Bogotá', () => {
  it('a las 9 de la noche en Bogotá todavía es el mismo día, aunque en UTC ya sea el siguiente', () => {
    // 2026-08-19T02:00Z son las 21:00 del 18 de agosto en Colombia (UTC-5).
    const instante = new Date('2026-08-19T02:00:00.000Z');
    expect(hoy(ZONA_HORARIA, instante)).toBe('2026-08-18');
  });

  it('a las 6 de la mañana en Bogotá el día ya cambió', () => {
    const instante = new Date('2026-08-19T11:00:00.000Z');
    expect(hoy(ZONA_HORARIA, instante)).toBe('2026-08-19');
  });
});

describe('conversión hacia y desde la base de datos', () => {
  it('ida y vuelta sin perder el día', () => {
    const fecha = '2026-10-07';
    expect(aFechaCivil(aDate(fecha))).toBe(fecha);
  });

  it('guarda siempre a medianoche UTC', () => {
    expect(aDate('2026-10-07').toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  it('lee el formato de Lucid Bot tal cual, sin convertir zonas', () => {
    // Lucid Bot ya entrega hora local de la cuenta: reinterpretarla movería el día.
    expect(aFechaCivil('2026-08-04 00:16:40')).toBe('2026-08-04');
    expect(aFechaCivil('2026-08-04T23:50:00.000Z')).toBe('2026-08-04');
  });
});

describe('utilidades de presentación', () => {
  it('formatea en español corto', () => {
    expect(formatearFecha('2026-10-07')).toBe('7 oct 2026');
  });

  it('la semana empieza en lunes', () => {
    expect(inicioDeSemana('2026-08-18')).toBe('2026-08-17'); // martes -> lunes
    expect(inicioDeSemana('2026-08-17')).toBe('2026-08-17'); // lunes -> él mismo
    expect(inicioDeSemana('2026-08-23')).toBe('2026-08-17'); // domingo -> lunes previo
  });
});
