import { prisma } from '@/lib/db';
import { error, leerJson, manejarError, ok } from '@/lib/http';
import { EsquemaPlantillaParcial } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const cambios = EsquemaPlantillaParcial.parse(await leerJson(peticion));

    const existente = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existente) return error('NO_ENCONTRADO', 'Esa plantilla no existe.');

    return ok(await prisma.messageTemplate.update({ where: { id }, data: cambios }));
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(_peticion: Request, { params }: Contexto) {
  try {
    const { id } = await params;
    const existente = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existente) return error('NO_ENCONTRADO', 'Esa plantilla no existe.');

    await prisma.messageTemplate.delete({ where: { id } });
    return ok({ eliminado: true });
  } catch (e) {
    return manejarError(e);
  }
}
