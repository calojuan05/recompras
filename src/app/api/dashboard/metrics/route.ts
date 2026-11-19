import { manejarError, ok } from '@/lib/http';
import { calcularMetricas } from '@/lib/services/metricas';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(await calcularMetricas());
  } catch (e) {
    return manejarError(e);
  }
}
