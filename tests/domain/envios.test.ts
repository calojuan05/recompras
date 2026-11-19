import { describe, expect, it } from 'vitest';

import { esDeLasIslas, leerDescripcion } from '@/lib/services/envios';

/** Descripción real de un pedido de Lucid Bot, copiada tal cual de la API. */
const REAL =
  'Nombre: Ana, Apellido: Pérez Gómez, Documento: "", Productos: (1 x Nombre producto: NEOCEL INVIMA X 500 GRAMOS), Número de teléfono: +573001234567, Valor total: 74900, Departamento: Valle del Cauca, Ciudad: Cali, Colonia: Barrio Centro, Dirección: Cra 1 #2-3, Casa 1, Piso 1, Código Postal: "", Notas: "", Correo electrónico: "", Método de pago: CON RECAUDO';

describe('leer el pedido de la descripción', () => {
  it('saca los campos del formato real', () => {
    const p = leerDescripcion(REAL);
    expect(p?.nombre).toBe('Ana Pérez Gómez');
    expect(p?.departamento).toBe('Valle del Cauca');
    expect(p?.ciudad).toBe('Cali');
    expect(p?.telefono).toBe('+573001234567');
    expect(p?.valor).toBe(74900);
  });

  it('no parte la dirección por sus propias comas', () => {
    // "Cra 1 #2-3, Casa 1, Piso 1" lleva dos comas dentro. Partir el texto
    // por comas dejaría "Cra 1 #2-3" y perdería casa y piso, que es
    // justamente lo que el transportador necesita para entregar.
    expect(leerDescripcion(REAL)?.direccion).toBe('Cra 1 #2-3, Casa 1, Piso 1');
  });

  it('deja en null los campos que vienen vacíos', () => {
    const sinCiudad = REAL.replace('Ciudad: Cali', 'Ciudad: ""');
    expect(leerDescripcion(sinCiudad)?.ciudad).toBeNull();
  });

  it('devuelve null si el texto no es un pedido', () => {
    expect(leerDescripcion('hola, quiero información')).toBeNull();
    expect(leerDescripcion('')).toBeNull();
  });
});

describe('qué cuenta como isla', () => {
  it('reconoce las formas en que llega el departamento', () => {
    expect(esDeLasIslas('San Andrés')).toBe(true);
    expect(esDeLasIslas('san andres')).toBe(true);
    expect(esDeLasIslas('SAN ANDRÉS Y PROVIDENCIA')).toBe(true);
    expect(esDeLasIslas('Archipiélago de San Andrés, Providencia y Santa Catalina')).toBe(true);
    expect(esDeLasIslas('Providencia')).toBe(true);
  });

  it('no se deja engañar por los municipios del continente', () => {
    // Hay un "San Andrés" municipio en Santander y un "San Andrés de Sotavento"
    // en Córdoba. Por eso el filtro mira el departamento y nunca la ciudad: con
    // la ciudad, esos pedidos entrarían a una lista que vigila envíos a una isla.
    expect(esDeLasIslas('Santander')).toBe(false);
    expect(esDeLasIslas('Córdoba')).toBe(false);
    expect(esDeLasIslas('Sucre')).toBe(false);
  });

  it('un departamento vacío no es isla', () => {
    // De los pedidos reales, unos cuantos llegan sin departamento. Si eso
    // contara como isla, la lista se llenaría de envíos del continente.
    expect(esDeLasIslas('')).toBe(false);
    expect(esDeLasIslas('   ')).toBe(false);
  });
});
