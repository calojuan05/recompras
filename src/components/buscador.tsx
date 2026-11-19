'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';

/**
 * Buscador que escribe en la URL. Así el estado de la búsqueda vive en la
 * dirección: se puede compartir, recargar y volver atrás.
 */
export function Buscador({
  parametro = 'q',
  marcador = 'Buscar...',
  ruta,
}: {
  parametro?: string;
  marcador?: string;
  ruta: string;
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [valor, setValor] = useState(parametros.get(parametro) ?? '');
  const [pendiente, iniciarTransicion] = useTransition();

  useEffect(() => {
    const actual = parametros.get(parametro) ?? '';
    if (valor === actual) return;

    // Espera a que el usuario deje de escribir antes de navegar.
    const temporizador = setTimeout(() => {
      const siguientes = new URLSearchParams(parametros.toString());
      if (valor) siguientes.set(parametro, valor);
      else siguientes.delete(parametro);
      siguientes.delete('pagina');
      iniciarTransicion(() => router.push(`${ruta}?${siguientes.toString()}`));
    }, 350);

    return () => clearTimeout(temporizador);
  }, [valor, parametros, parametro, router, ruta]);

  return (
    <Input
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      placeholder={marcador}
      className="max-w-xs"
      aria-label={marcador}
      data-pendiente={pendiente}
    />
  );
}
