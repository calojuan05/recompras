'use client';

import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';

const CLAVE = 'recompras-tema';

/** El tema vive en el DOM (la clase `dark` de <html>), no en el estado de React. */
const oyentes = new Set<() => void>();

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
  };
}

const leerDelDom = () => document.documentElement.classList.contains('dark');

/** En el servidor no hay DOM: se asume claro y el cliente corrige al hidratar. */
const leerEnServidor = () => false;

function aplicar(oscuro: boolean) {
  marcar(oscuro);
  for (const oyente of oyentes) oyente();
}

function marcar(oscuro: boolean) {
  document.documentElement.classList.toggle('dark', oscuro);
  document.documentElement.dataset.tema = oscuro ? 'oscuro' : 'claro';
}

/**
 * Preferencia guardada o, si no hay ninguna, la del sistema operativo.
 * Corre una sola vez al cargar el módulo en el navegador, antes del primer
 * render, para que la clase ya esté puesta cuando React pinte.
 */
if (typeof document !== 'undefined') {
  let oscuro = false;
  try {
    const guardado = localStorage.getItem(CLAVE);
    oscuro = guardado
      ? guardado === 'oscuro'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    oscuro = false;
  }
  marcar(oscuro);
}

/**
 * Alternador de modo claro / oscuro.
 *
 * El fondo inicial ya lo resuelve una media query en globals.css, así que quien
 * tenga el sistema en oscuro no ve un destello blanco mientras carga el
 * JavaScript. Se hace en el cliente y no en el servidor a propósito: Next 16
 * prerenderiza el layout raíz en el shell estático, de modo que una cookie
 * leída ahí no llegaría a tiempo.
 */
export function BotonTema() {
  const oscuro = useSyncExternalStore(suscribir, leerDelDom, leerEnServidor);

  const alternar = () => {
    // Se lee del DOM y no de `oscuro`: dos clics seguidos dentro del mismo
    // ciclo de render compartirían el valor viejo del cierre.
    const siguiente = !leerDelDom();
    aplicar(siguiente);
    try {
      localStorage.setItem(CLAVE, siguiente ? 'oscuro' : 'claro');
    } catch {
      // Sin localStorage el tema simplemente no se recuerda entre visitas.
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={alternar}
      aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={oscuro ? 'Modo claro' : 'Modo oscuro'}
    >
      <span className="text-base leading-none">{oscuro ? '☀' : '☾'}</span>
    </Button>
  );
}
