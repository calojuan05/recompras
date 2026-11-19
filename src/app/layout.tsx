import type { Metadata } from 'next';
import { RefreshCw } from 'lucide-react';

import { Navegacion } from '@/components/navegacion';
import { BotonTema } from '@/components/tema';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

export const metadata: Metadata = {
  title: 'Recompras',
  description: 'Ciclos de recompra programada para suplementos nutricionales.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // La clase `dark` la pone BotonTema al montar. El color de fondo inicial lo
  // resuelve una media query en globals.css, así que quien tenga el sistema en
  // oscuro no ve un flash blanco mientras carga.
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="bg-sidebar border-border shrink-0 border-b p-4 md:w-60 md:border-r md:border-b-0">
            <div className="mb-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg shadow-sm">
                  <RefreshCw aria-hidden className="size-4.5" />
                </div>
                <div>
                  <p className="text-base leading-none font-semibold tracking-tight">recompras</p>
                  <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">Suplementos · Colombia</p>
                </div>
              </div>
              <BotonTema />
            </div>
            <Navegacion />
          </aside>

          <main className="min-w-0 flex-1 p-4 md:p-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">{children}</div>
          </main>
        </div>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
