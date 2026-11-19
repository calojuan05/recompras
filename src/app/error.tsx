'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[panel]', error);
  }, [error]);

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="text-base">Algo se rompió en esta pantalla</CardTitle>
        <CardDescription>
          El detalle quedó en la consola del navegador y en la del servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
          {error.message}
          {error.digest ? `\n\nid: ${error.digest}` : ''}
        </pre>
        <div>
          <Button onClick={reset} size="sm">
            Reintentar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
