import { prisma } from '@/lib/db';
import { leerJson, manejarError, ok } from '@/lib/http';
import { EsquemaPlantilla } from '@/lib/validation/esquemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const plantillas = await prisma.messageTemplate.findMany({ orderBy: { nombre: 'asc' } });
    return ok({ total: plantillas.length, datos: plantillas });
  } catch (e) {
    return manejarError(e);
  }
}

export async function POST(peticion: Request) {
  try {
    const datos = EsquemaPlantilla.parse(await leerJson(peticion));
    const plantilla = await prisma.messageTemplate.create({ data: datos });
    return ok(plantilla, 201);
  } catch (e) {
    return manejarError(e);
  }
}
