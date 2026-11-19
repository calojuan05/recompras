'use client';

import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Mail, Package, Plane, RefreshCw, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const ENLACES: { href: string; etiqueta: string; Icono: LucideIcon }[] = [
  { href: '/', etiqueta: 'Panel', Icono: LayoutDashboard },
  { href: '/clientes', etiqueta: 'Clientes', Icono: Users },
  { href: '/productos', etiqueta: 'Productos', Icono: Package },
  { href: '/ciclos', etiqueta: 'Ciclos', Icono: RefreshCw },
  { href: '/envios', etiqueta: 'Envíos islas', Icono: Plane },
  { href: '/mensajeria', etiqueta: 'Mensajería', Icono: Mail },
  { href: '/configuracion', etiqueta: 'Configuración', Icono: Settings },
];

export function Navegacion() {
  const ruta = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ENLACES.map(({ href, etiqueta, Icono }) => {
        const activo = href === '/' ? ruta === '/' : ruta.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              activo
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icono aria-hidden className="size-4 shrink-0" />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
