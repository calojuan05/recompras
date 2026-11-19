import { Encabezado } from '@/components/comunes';
import { PanelEnvios } from '@/components/panel-envios';
import { DIAS_LIMITE, listarEnvios } from '@/lib/services/envios';

export const dynamic = 'force-dynamic';

export default async function PaginaEnvios() {
  const envios = await listarEnvios();
  const enRiesgo = envios.filter((e) => e.enRiesgo).length;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Envíos a las islas"
        descripcion={
          enRiesgo > 0
            ? `${enRiesgo} sin entregar después de ${DIAS_LIMITE} días.`
            : `Vigilancia de San Andrés y Providencia. Nada pasado de ${DIAS_LIMITE} días.`
        }
      />
      <PanelEnvios envios={envios} diasLimite={DIAS_LIMITE} />
    </div>
  );
}
