'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProductoOpcion {
  id: string;
  nombre: string;
  duracionEstimadaDias: number;
}

/**
 * Registrar una compra a mano. Al guardar, la API crea el ciclo y devuelve las
 * fechas calculadas: se muestran ahí mismo para poder comprobarlas sin salir.
 */
export function NuevaCompra({
  clienteId,
  productos,
}: {
  clienteId: string;
  productos: ProductoOpcion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [productId, setProductId] = useState(productos[0]?.id ?? '');
  const [cantidadFrascos, setCantidad] = useState('1');
  const [fechaCompra, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [estadoEntrega, setEstado] = useState('entregado');

  const enviar = async () => {
    setEnviando(true);
    try {
      const respuesta = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: clienteId,
          productId,
          cantidadFrascos: Number(cantidadFrascos),
          fechaCompra,
          estadoEntrega,
        }),
      });

      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(cuerpo?.error?.message ?? 'No se pudo registrar la compra.');
        return;
      }

      if (cuerpo.ciclo) {
        toast.success('Compra registrada', {
          description: `Se le acaba el ${cuerpo.ciclo.fechaAgotamiento} · avisar el ${cuerpo.ciclo.fechaRecompraSugerida}`,
          duration: 8000,
        });
      } else {
        toast.success('Compra registrada', {
          description: cuerpo.aviso ?? 'No generó ciclo.',
        });
      }

      setAbierto(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setEnviando(false);
    }
  };

  const producto = productos.find((p) => p.id === productId);
  const diasEstimados = producto
    ? producto.duracionEstimadaDias * (Number(cantidadFrascos) || 1)
    : 0;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm">Registrar compra</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar una compra</DialogTitle>
          <DialogDescription>
            El ciclo de recompra se calcula solo al guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="producto">Producto</Label>
            <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
              <SelectTrigger id="producto">
                <SelectValue placeholder="Elige un producto" />
              </SelectTrigger>
              <SelectContent>
                {productos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre} ({p.duracionEstimadaDias} días)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cantidad">Frascos</Label>
              <Input
                id="cantidad"
                type="number"
                min={1}
                max={50}
                value={cantidadFrascos}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fecha">Fecha de entrega</Label>
              <Input
                id="fecha"
                type="date"
                value={fechaCompra}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="entrega">Estado de entrega</Label>
            <Select value={estadoEntrega} onValueChange={(v) => setEstado(v ?? 'entregado')}>
              <SelectTrigger id="entrega">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entregado">Entregado</SelectItem>
                <SelectItem value="transito">En tránsito</SelectItem>
                <SelectItem value="devuelto">Devuelto</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Solo lo entregado arranca un ciclo: lo que no llegó no se consume.
            </p>
          </div>

          {producto && estadoEntrega === 'entregado' && (
            <p className="text-muted-foreground bg-muted rounded-md p-3 text-xs">
              Estimación: {diasEstimados} días de producto. La fecha final puede moverse si
              este cliente ya tiene historial de consumo o un ciclo sin agotar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || !productId}>
            {enviando ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
