import { describe, expect, it } from 'vitest';

import { inicioDelMes, MAX_CONSULTAS } from '@/lib/services/envios';

describe('acotar la sincronización al mes', () => {
  it('el arranque por defecto es el día 1 del mes en curso', () => {
    // Sin esto, la sincronización miraría los 1.100 pedidos históricos y pedir
    // tantos detalles seguidos deja la cuenta sin API durante horas. Pasó.
    expect(inicioDelMes('2026-09-15')).toBe('2026-09-01');
    expect(inicioDelMes('2026-01-31')).toBe('2026-01-01');
    expect(inicioDelMes('2026-12-01')).toBe('2026-12-01');
  });

  it('hay un tope de consultas por corrida', () => {
    expect(MAX_CONSULTAS).toBeLessThanOrEqual(100);
    expect(MAX_CONSULTAS).toBeGreaterThan(0);
  });
});
