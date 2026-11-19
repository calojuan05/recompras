import { describe, expect, it } from 'vitest';

import {
  clasificarEstado,
  enVentanaDeContacto,
  esEstadoCiclo,
  ESTADOS_ABIERTOS,
  ESTADOS_AUTOMATICOS,
  ESTADOS_MANUALES,
} from '@/lib/domain/estados';

// Ciclo de referencia: se le acaba el 7 de octubre, se avisa desde el 30 de septiembre.
const FECHAS = {
  fechaRecompraSugerida: '2026-09-30',
  fechaAgotamientoEstimada: '2026-10-07',
};

describe('reclasificación diaria', () => {
  it('antes de la ventana sigue programado', () => {
    expect(clasificarEstado('PROGRAMADO', FECHAS, '2026-09-29')).toBe('PROGRAMADO');
  });

  it('el mismo día de la fecha sugerida entra en la ventana', () => {
    expect(clasificarEstado('PROGRAMADO', FECHAS, '2026-09-30')).toBe('POR_VENCER');
  });

  it('dentro de la ventana está por vencer', () => {
    expect(clasificarEstado('PROGRAMADO', FECHAS, '2026-10-03')).toBe('POR_VENCER');
    expect(clasificarEstado('POR_VENCER', FECHAS, '2026-10-07')).toBe('POR_VENCER');
  });

  it('pasado el agotamiento queda vencido: ya se quedó sin producto', () => {
    expect(clasificarEstado('POR_VENCER', FECHAS, '2026-10-08')).toBe('VENCIDO');
  });

  it('recorre los tres estados en orden a lo largo del tiempo', () => {
    const recorrido = ['2026-09-01', '2026-10-01', '2026-11-01'].map((dia) =>
      clasificarEstado('PROGRAMADO', FECHAS, dia),
    );
    expect(recorrido).toEqual(['PROGRAMADO', 'POR_VENCER', 'VENCIDO']);
  });
});

describe('el motor no pisa decisiones humanas', () => {
  it('deja intactos los estados que fijó una persona', () => {
    for (const estado of ['CONTACTADO', 'RECOMPRADO', 'PAUSADO', 'CANCELADO'] as const) {
      expect(clasificarEstado(estado, FECHAS, '2026-12-31')).toBe(estado);
    }
  });

  it('un ciclo contactado no vuelve solo a "por vencer"', () => {
    // Si el job pudiera reclasificarlo, marcarlo contactado no serviría de nada:
    // a la mañana siguiente reaparecería en la lista de pendientes.
    expect(clasificarEstado('CONTACTADO', FECHAS, '2026-10-03')).toBe('CONTACTADO');
    expect(clasificarEstado('CONTACTADO', FECHAS, '2026-10-20')).toBe('CONTACTADO');
  });
});

describe('contactado', () => {
  it('cuenta como ciclo vivo: el cliente sigue sin recomprar', () => {
    expect(ESTADOS_ABIERTOS).toContain('CONTACTADO');
  });

  it('lo fija una persona, no el motor', () => {
    expect(ESTADOS_MANUALES).toContain('CONTACTADO');
    expect(ESTADOS_AUTOMATICOS).not.toContain('CONTACTADO');
  });

  it('ya no está en ventana: escribirle otra vez sería insistir', () => {
    expect(enVentanaDeContacto('CONTACTADO')).toBe(false);
  });
});

describe('ventana de contacto', () => {
  it('solo se contacta a quien está por quedarse sin producto o ya se quedó', () => {
    expect(enVentanaDeContacto('POR_VENCER')).toBe(true);
    expect(enVentanaDeContacto('VENCIDO')).toBe(true);
    expect(enVentanaDeContacto('PROGRAMADO')).toBe(false);
    expect(enVentanaDeContacto('PAUSADO')).toBe(false);
    expect(enVentanaDeContacto('RECOMPRADO')).toBe(false);
  });
});

describe('validación de estados', () => {
  it('reconoce los válidos y rechaza el resto', () => {
    expect(esEstadoCiclo('VENCIDO')).toBe(true);
    expect(esEstadoCiclo('vencido')).toBe(false);
    expect(esEstadoCiclo('INVENTADO')).toBe(false);
  });
});
