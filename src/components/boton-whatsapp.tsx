import { enlaceWhatsapp } from '@/lib/domain';
import { cn } from '@/lib/utils';

/** Logo de WhatsApp, dibujado en línea para no depender de ninguna red. */
function IconoWhatsapp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-4', className)}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

interface Props {
  telefono: string | null | undefined;
  /** Texto que queda escrito en la caja del chat. No se envía solo. */
  mensaje?: string | null;
  /** `icono` para las tablas densas, `completo` para las fichas. */
  variante?: 'icono' | 'completo';
  etiqueta?: string;
  /** Se avisa cuando el cliente no dio consentimiento, pero no se bloquea. */
  consentimiento?: boolean;
  className?: string;
}

/**
 * Abre el chat de WhatsApp con el cliente, con el mensaje ya escrito.
 *
 * Es un enlace, no un envío: WhatsApp deja el texto en la caja y la persona
 * decide si lo manda, lo edita o lo descarta. Coherente con el resto del
 * sistema, que nunca escribe a nadie por su cuenta.
 */
export function BotonWhatsapp({
  telefono,
  mensaje,
  variante = 'icono',
  etiqueta = 'WhatsApp',
  consentimiento = true,
  className,
}: Props) {
  const enlace = enlaceWhatsapp(telefono, mensaje);

  if (!enlace) {
    return variante === 'completo' ? (
      <span className="text-muted-foreground text-xs">Sin teléfono válido</span>
    ) : null;
  }

  const titulo = consentimiento
    ? mensaje
      ? 'Abrir WhatsApp con el mensaje escrito'
      : 'Abrir el chat de WhatsApp'
    : 'Este cliente no dio consentimiento para recibir mensajes';

  const base =
    'inline-flex items-center gap-1.5 rounded-md border transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

  const colores = consentimiento
    ? 'border-emerald-600/25 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20 dark:text-emerald-400'
    : 'border-amber-600/25 bg-amber-600/10 text-amber-700 hover:bg-amber-600/20 dark:text-amber-400';

  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      title={titulo}
      aria-label={`${etiqueta}${consentimiento ? '' : ' (sin consentimiento)'}`}
      className={cn(
        base,
        colores,
        variante === 'icono' ? 'size-7 justify-center' : 'h-8 px-2.5 text-xs font-medium',
        className,
      )}
    >
      <IconoWhatsapp className={variante === 'icono' ? 'size-3.5' : 'size-3.5'} />
      {variante === 'completo' ? etiqueta : null}
      {variante === 'completo' && !consentimiento ? (
        <span className="opacity-70">· sin consentimiento</span>
      ) : null}
    </a>
  );
}
