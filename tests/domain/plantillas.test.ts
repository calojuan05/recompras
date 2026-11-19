import { describe, expect, it } from 'vitest';

import {
  describirDiasRestantes,
  renderizarPlantilla,
  variablesFaltantes,
} from '@/lib/domain/plantillas';

const PLANTILLA =
  'Hola {{nombre}}, tu {{producto}} está por terminarse ({{dias_restantes}}). Pídelo aquí: {{link_recompra}}';

describe('renderizado de plantillas', () => {
  it('sustituye todas las variables', () => {
    const texto = renderizarPlantilla(PLANTILLA, {
      nombre: 'Luz',
      producto: 'Colágeno NeoCell 500 g',
      dias_restantes: '7 días',
      link_recompra: 'https://vico.com.co',
    });

    expect(texto).toBe(
      'Hola Luz, tu Colágeno NeoCell 500 g está por terminarse (7 días). Pídelo aquí: https://vico.com.co',
    );
  });

  it('tolera espacios dentro de las llaves', () => {
    expect(renderizarPlantilla('Hola {{ nombre }}', { nombre: 'Ana' })).toBe('Hola Ana');
  });

  it('deja intacta la variable que no sabe resolver, en vez de escribir "undefined"', () => {
    expect(renderizarPlantilla('Hola {{nombre}} de {{ciudad}}', { nombre: 'Ana' })).toBe(
      'Hola Ana de {{ciudad}}',
    );
  });

  it('avisa de las variables sin dato antes de enviar', () => {
    expect(variablesFaltantes(PLANTILLA, { nombre: 'Ana' })).toEqual([
      'producto',
      'dias_restantes',
      'link_recompra',
    ]);
    expect(variablesFaltantes('Sin variables', {})).toEqual([]);
  });
});

describe('redacción de los días restantes', () => {
  it('no le dice a nadie que le quedan menos veintitrés días', () => {
    expect(describirDiasRestantes(7)).toBe('7 días');
    expect(describirDiasRestantes(1)).toBe('1 día');
    expect(describirDiasRestantes(0)).toBe('menos de un día');
    expect(describirDiasRestantes(-1)).toBe('se terminó ayer');
    expect(describirDiasRestantes(-23)).toBe('se terminó hace 23 días');
  });
});
