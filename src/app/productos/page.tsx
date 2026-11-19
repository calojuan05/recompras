import { Encabezado, Vacio } from '@/components/comunes';
import { EditorProducto } from '@/components/editor-producto';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ETIQUETA_UNIDAD, type UnidadMedida } from '@/lib/domain';
import { prisma } from '@/lib/db';
import { numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaProductos() {
  const productos = await prisma.product.findMany({
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    include: {
      alias: { select: { patron: true } },
      escalas: { select: { valor: true, unidades: true }, orderBy: { valor: 'asc' } },
      _count: { select: { compras: true, ciclos: true } },
    },
  });

  return (
    <>
      <Encabezado
        titulo="Productos"
        descripcion="La dosis diaria define cuántos días rinde cada envase, y de ahí sale toda la programación."
      />

      <Card className="border-amber-200 dark:border-amber-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Revisa las dosis antes de mandar el primer mensaje</CardTitle>
          <CardDescription className="text-xs">
            Las dosis que trae la plataforma son las de la etiqueta habitual de cada tipo de
            producto, no están confirmadas con el proveedor. Es el único dato que no se puede
            deducir de los pedidos y del que dependen todas las fechas.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {productos.length === 0 ? (
            <Vacio
              titulo="Sin productos"
              descripcion="Corre `npm run seed:catalogo` para cargar el catálogo base."
            />
          ) : (
            <div className="tabla-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Contenido</TableHead>
                    <TableHead className="text-right">Dosis diaria</TableHead>
                    <TableHead className="text-right">Rinde</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead>Reconoce como</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.map((p) => (
                    <TableRow key={p.id} className={p.activo ? '' : 'opacity-50'}>
                      <TableCell>
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-muted-foreground text-xs">
                          {p.presentacion || p.sku || '—'}
                          {p.diasDeAnticipacion !== null
                            ? ` · avisa ${p.diasDeAnticipacion} días antes`
                            : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {numero(p.unidadesPorFrasco)}{' '}
                        <span className="text-muted-foreground text-xs">
                          {ETIQUETA_UNIDAD[p.unidadMedida as UnidadMedida] ?? p.unidadMedida}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.dosisDiariaSugerida}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {p.duracionEstimadaDias} días
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {pesos(p.precio)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p._count.compras}
                        <span className="text-muted-foreground text-xs"> / {p._count.ciclos}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-52 flex-wrap gap-1">
                          {p.alias.slice(0, 3).map((a) => (
                            <Badge key={a.patron} variant="outline" className="text-[10px]">
                              {a.patron}
                            </Badge>
                          ))}
                          {p.alias.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{p.alias.length - 3}
                            </Badge>
                          )}
                        </div>
                        {p.escalas.length > 0 && (
                          <p className="text-muted-foreground mt-1 text-[10px]">
                            escalas:{' '}
                            {p.escalas.map((e) => `${pesos(e.valor)}=${e.unidades}`).join(' · ')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <EditorProducto
                          producto={{
                            id: p.id,
                            nombre: p.nombre,
                            unidadMedida: p.unidadMedida,
                            unidadesPorFrasco: p.unidadesPorFrasco,
                            dosisDiariaSugerida: p.dosisDiariaSugerida,
                            diasDeAnticipacion: p.diasDeAnticipacion,
                            precio: p.precio,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        La columna &ldquo;Compras / ciclos&rdquo; muestra cuántos pedidos se le atribuyeron al
        producto y cuántos ciclos vivos generó. Las escalas de precio traducen el valor del
        pedido a unidades reales, porque el título que manda el bot no es confiable.
      </p>
    </>
  );
}
