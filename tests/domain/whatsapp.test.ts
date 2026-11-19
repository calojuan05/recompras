import { describe, expect, it } from 'vitest';

import { enlaceWhatsapp, normalizarTelefono } from '@/lib/domain/whatsapp';

describe('normalización de teléfonos', () => {
  it('acepta el formato que llega de Lucid Bot', () => {
    // El contact_id de Chatrace es el número con indicativo y sin el +.
    expect(normalizarTelefono('+573001234567')).toBe('573001234567');
    expect(normalizarTelefono('573001234567')).toBe('573001234567');
  });

  it('limpia la basura que se escribe a mano', () => {
    expect(normalizarTelefono('+57 300 123 4567')).toBe('573001234567');
    expect(normalizarTelefono('(300) 123-4567')).toBe('573001234567');
    expect(normalizarTelefono('300.123.4567')).toBe('573001234567');
  });

  it('le pone el indicativo a un celular colombiano suelto', () => {
    expect(normalizarTelefono('3001234567')).toBe('573001234567');
  });

  it('entiende el prefijo internacional largo', () => {
    expect(normalizarTelefono('0057 300 123 4567')).toBe('573001234567');
  });

  it('respeta números de otros países', () => {
    expect(normalizarTelefono('+52 55 1234 5678')).toBe('525512345678');
    expect(normalizarTelefono('+1 305 555 0142')).toBe('13055550142');
  });

  it('devuelve null en vez de armar un enlace roto', () => {
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono('')).toBeNull();
    expect(normalizarTelefono('sin número')).toBeNull();
    expect(normalizarTelefono('12345')).toBeNull(); // demasiado corto
    expect(normalizarTelefono('1234567890123456789')).toBeNull(); // demasiado largo
  });
});

describe('enlace de WhatsApp', () => {
  it('abre el chat sin texto', () => {
    expect(enlaceWhatsapp('+573001234567')).toBe('https://wa.me/573001234567');
  });

  it('deja el mensaje escrito, con los saltos de línea y las tildes intactos', () => {
    const enlace = enlaceWhatsapp('+573001234567', 'Hola Luz,\ntu Colágeno está por terminarse.');
    expect(enlace).toBe(
      'https://wa.me/573001234567?text=Hola%20Luz%2C%0Atu%20Col%C3%A1geno%20est%C3%A1%20por%20terminarse.',
    );
  });

  it('escapa lo que rompería la URL', () => {
    const enlace = enlaceWhatsapp('573001234567', 'Pide aquí: https://vico.com.co?ref=a&b=1');
    expect(enlace).toContain('%3F'); // el ? del enlace no puede quedar crudo
    expect(enlace).toContain('%26'); // ni el &
    // Un solo separador de query: el de wa.me.
    expect(enlace!.split('?')).toHaveLength(2);
  });

  it('sin teléfono usable no hay enlace', () => {
    expect(enlaceWhatsapp(null, 'hola')).toBeNull();
    expect(enlaceWhatsapp('no es un teléfono', 'hola')).toBeNull();
  });
});
