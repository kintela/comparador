import "server-only";

import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

const NOMBRE_POR_SLUG: Record<string, string> = {
  eroski: "Eroski",
  bm: "BM Supermercados",
  mercadona: "Mercadona",
  aldi: "ALDI",
  dia: "DIA",
  lidl: "Lidl",
  alcampo: "Alcampo",
  lupa: "Lupa",
  coviran: "Covirán",
  carrefour: "Carrefour",
  costco: "Costco",
  primaprix: "Primaprix",
};

type ProgresoDb = {
  supermercado: string;
  estado: "completado" | "error";
  fecha_procesado: string;
  productos_encontrados: number;
};

type SolicitudConProgresoDb = {
  solicitudes_rastreo_progreso: ProgresoDb[];
};

type SolicitudPendienteDb = {
  id: string;
  estado: string;
  supermercados_solicitados: string[];
};

export async function reconciliarSolicitudConCatalogo({
  terminoNormalizado,
  supermercadosEncontrados,
}: {
  terminoNormalizado: string;
  supermercadosEncontrados: string[];
}): Promise<void> {
  if (supermercadosEncontrados.length === 0) return;

  const supabase = obtenerSupabaseServidor();
  const { data, error } = await supabase
    .from("solicitudes_rastreo")
    .select("id, estado, supermercados_solicitados")
    .eq("termino_normalizado", terminoNormalizado)
    .maybeSingle();

  if (error) {
    if (
      error.code === "42P01" ||
      /does not exist|schema cache/i.test(error.message)
    ) {
      return;
    }
    throw new Error(`No se pudo reconciliar la solicitud: ${error.message}`);
  }

  const solicitud = data as SolicitudPendienteDb | null;
  if (!solicitud || solicitud.estado === "procesando") return;

  const encontrados = new Set(supermercadosEncontrados);
  const pendientes = (solicitud.supermercados_solicitados ?? []).filter(
    (supermercado) => !encontrados.has(supermercado),
  );
  if (pendientes.length === solicitud.supermercados_solicitados.length) return;

  const completada = pendientes.length === 0;
  const ahora = new Date().toISOString();
  const { error: errorActualizar } = await supabase
    .from("solicitudes_rastreo")
    .update({
      supermercados_solicitados: pendientes,
      estado: completada ? "completada" : "pendiente",
      fecha_procesado: completada ? ahora : null,
      updated_at: ahora,
    })
    .eq("id", solicitud.id)
    .neq("estado", "procesando");

  if (errorActualizar) {
    throw new Error(
      `No se pudo actualizar la cobertura pendiente: ${errorActualizar.message}`,
    );
  }
}

export async function obtenerCadenasComprobadasRecientemente({
  terminoNormalizado,
  diasVigencia = 7,
}: {
  terminoNormalizado: string;
  diasVigencia?: number;
}): Promise<{
  conResultados: string[];
  sinResultados: string[];
}> {
  const desde = new Date(
    Date.now() - diasVigencia * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await obtenerSupabaseServidor()
    .from("solicitudes_rastreo")
    .select(
      "solicitudes_rastreo_progreso(supermercado, estado, fecha_procesado, productos_encontrados)",
    )
    .eq("termino_normalizado", terminoNormalizado)
    .maybeSingle();

  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST200" ||
      /does not exist|schema cache|relationship/i.test(error.message)
    ) {
      return { conResultados: [], sinResultados: [] };
    }
    throw new Error(
      `No se pudo comprobar la cobertura reciente: ${error.message}`,
    );
  }

  const solicitud = data as unknown as SolicitudConProgresoDb | null;
  const recientes = (solicitud?.solicitudes_rastreo_progreso ?? []).filter(
    (progreso) =>
      progreso.estado === "completado" && progreso.fecha_procesado >= desde,
  );
  const nombres = (progresos: ProgresoDb[]) => [
    ...new Set(
      progresos
        .map((progreso) => NOMBRE_POR_SLUG[progreso.supermercado])
        .filter((nombre): nombre is string => Boolean(nombre)),
    ),
  ];
  return {
    conResultados: nombres(
      recientes.filter((progreso) => progreso.productos_encontrados > 0),
    ),
    sinResultados: nombres(
      recientes.filter((progreso) => progreso.productos_encontrados === 0),
    ),
  };
}
