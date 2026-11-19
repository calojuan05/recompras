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

export interface ProductoEditable {
  id: string;
  nombre: string;
  unidadMedida: string;
  unidadesPorFrasco: number;
  dosisDiariaSugerida: number;
  diasDeAnticipacion: number | null;
  precio: number;
}

const UNIDADES = [
  { valor: 'capsulas', etiqueta: 'cápsulas' },
  { valor: 'gramos', etiqueta: 'gramos' },
  { valor: 'ml', etiqueta: 'mililitros' },
  { valor: 'sobres', etiqueta: 'sobres' },
];

/**
 * La dosis diaria es el único dato del sistema que no se puede deducir de los
 * pedidos, y de ella depende toda la aritmética. Por eso se edita aquí, con la
 * duración recalculándose a la vista mientras se escribe.
 */
export function EditorProducto({ producto }: { producto: ProductoEditable }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [unidadMedida, setUnidad] = useState(producto.unidadMedida);
  const [unidadesPorFrasco, setUnidades] = useState(String(producto.unidadesPorFrasco));
  const [dosisDiariaSugerida, setDosis] = useState(String(producto.dosisDiariaSugerida));
  const [diasDeAnticipacion, setAnticipacion] = useState(
    producto.diasDeAnticipacion === null ? '' : String(producto.diasDeAnticipacion),
  );
  const [precio, setPrecio] = useState(String(producto.precio));

  const unidades = Number(unidadesPorFrasco);
  const dosis = Number(dosisDiariaSugerida);
  const duracion = dosis > 0 && unidades > 0 ? Math.floor(unidades / dosis) : 0;

  const guardar = async () => {
    setEnviando(true);
    try {
      const respuesta = await fetch(`/api/products/${producto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unidadMedida,
          unidadesPorFrasco: unidades,
          dosisDiariaSugerida: dosis,
          diasDeAnticipacion: diasDeAnticipacion === '' ? null : Number(diasDeAnticipacion),
          precio: Number(precio),
        }),
      });

      const cuerpo = await respuesta.json();
      if (!respuesta.ok) {
        toast.error(cuerpo?.error?.message ?? 'No se pudo guardar.');
        return;
      }

      const recalculo = cuerpo.recalculo;
      toast.success(`${producto.nombre}: ahora rinde ${cuerpo.producto.duracionEstimadaDias} días`, {
        description: recalculo
          ? `Se recalcularon ${recalculo.ciclosActualizados} ciclos con las fechas nuevas.`
          : 'Las fechas de los ciclos no cambiaron.',
        duration: 7000,
      });

      setAbierto(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Editar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{producto.nombre}</DialogTitle>
          <DialogDescription>
            Cambiar la dosis mueve las fechas de todos los ciclos de este producto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="unidades">Contenido del envase</Label>
              <Input
                id="unidades"
                type="number"
                min={1}
                step="any"
                value={unidadesPorFrasco}
                onChange={(e) => setUnidades(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unidad">Unidad</Label>
              <Select value={unidadMedida} onValueChange={(v) => setUnidad(v ?? 'capsulas')}>
                <SelectTrigger id="unidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => (
                    <SelectItem key={u.valor} value={u.valor}>
                      {u.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dosis">Dosis diaria</Label>
              <Input
                id="dosis"
                type="number"
                min={0.1}
                step="any"
                value={dosisDiariaSugerida}
                onChange={(e) => setDosis(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="precio">Precio</Label>
              <Input
                id="precio"
                type="number"
                min={0}
                step={100}
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="anticipacion">Días de anticipación (opcional)</Label>
            <Input
              id="anticipacion"
              type="number"
              min={0}
              max={365}
              placeholder="usa el valor global"
              value={diasDeAnticipacion}
              onChange={(e) => setAnticipacion(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Déjalo vacío para usar el valor de Configuración.
            </p>
          </div>

          <p
            className={
              duracion > 0
                ? 'bg-muted rounded-md p-3 text-sm'
                : 'rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300'
            }
          >
            {duracion > 0
              ? `${unidadesPorFrasco} ${unidadMedida} ÷ ${dosisDiariaSugerida} al día = ${duracion} días por frasco`
              : 'Con estos valores el frasco no alcanza para un día completo.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={enviando || duracion < 1}>
            {enviando ? 'Guardando...' : 'Guardar y recalcular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
