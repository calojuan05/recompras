/**
 * Enlaces de WhatsApp para escribirle a un cliente desde el panel.
 *
 * Se usa wa.me, el "click to chat" oficial: abre la conversación con el número
 * y, si se le pasa texto, lo deja escrito en la caja SIN enviarlo. El envío lo
 * hace una persona pulsando el botón, que es exactamente lo que queremos: el
 * sistema nunca manda nada solo.
 *
 * Funciona igual en WhatsApp Web, en el escritorio y en el teléfono.
 */

/** Indicativo que se asume cuando el número viene sin país. */
export const INDICATIVO_POR_DEFECTO = '57'; // Colombia

/**
 * Deja el número como lo quiere wa.me: solo dígitos, con indicativo y sin el +.
 * Devuelve null si no queda un número usable.
 */
export function normalizarTelefono(
  telefono: string | null | undefined,
  indicativo: string = INDICATIVO_POR_DEFECTO,
): string | null {
  if (!telefono) return null;

  let digitos = telefono.replace(/\D/g, '');
  if (!digitos) return null;

  // 00 delante es la forma internacional larga: 0057... -> 57...
  if (digitos.startsWith('00')) digitos = digitos.slice(2);

  // Un celular colombiano suelto son 10 dígitos y empieza por 3.
  if (digitos.length === 10 && digitos.startsWith('3')) {
    digitos = indicativo + digitos;
  }

  // Menos de once dígitos ya no es un número internacional válido.
  if (digitos.length < 11 || digitos.length > 15) return null;

  return digitos;
}

/**
 * URL para abrir el chat. `texto` queda escrito en la caja, listo para revisar
 * antes de enviar. Devuelve null si el teléfono no sirve.
 */
export function enlaceWhatsapp(
  telefono: string | null | undefined,
  texto?: string | null,
): string | null {
  const numero = normalizarTelefono(telefono);
  if (!numero) return null;

  const base = `https://wa.me/${numero}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
