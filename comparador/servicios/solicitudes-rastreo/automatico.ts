import "server-only";

import type { SupermercadoRastreo } from "@/servicios/rastreo/terminos";
import { SUPERMERCADOS_RASTREO } from "@/servicios/rastreo/terminos";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

const NOMBRE_POR_SUPERMERCADO: Record<SupermercadoRastreo, string> = {
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

type ProgresoSolicitud = {
  supermercado: string;
  estado: "completado" | "error";
};

type SolicitudDb = {
  id: string;
  termino_original: string;
  termino_normalizado: string;
  supermercados_solicitados: string[];
  solicitudes_rastreo_progreso: ProgresoSolicitud[];
};

export type SolicitudAutomatica = {
  id: string;
  termino: string;
  terminoNormalizado: string;
  supermercadosObjetivo: SupermercadoRastreo[];
};

function supermercadosObjetivo(
  nombres: string[],
): SupermercadoRastreo[] {
  if (nombres.length === 0) return [...SUPERMERCADOS_RASTREO];

  const normalizados = new Set(
    nombres.map((nombre) => nombre.trim().toLocaleLowerCase("es")),
  );
  const supermercados = SUPERMERCADOS_RASTREO.filter((slug) => {
    const nombre = NOMBRE_POR_SUPERMERCADO[slug].toLocaleLowerCase("es");
    return normalizados.has(nombre) || (slug === "bm" && normalizados.has("bm"));
  });

  return supermercados.length > 0
    ? supermercados
    : [...SUPERMERCADOS_RASTREO];
}

export async function obtenerSolicitudesAutomaticas(
  supermercado: SupermercadoRastreo,
): Promise<SolicitudAutomatica[]> {
  const supabase = obtenerSupabaseServidor();
  const filas: SolicitudDb[] = [];

  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("solicitudes_rastreo")
      .select(
        "id, termino_original, termino_normalizado, supermercados_solicitados, solicitudes_rastreo_progreso(supermercado, estado)",
      )
      .in("estado", ["pendiente", "procesando"])
      .order("total_solicitudes", { ascending: false })
      .order("fecha_ultima_solicitud", { ascending: true })
      .range(desde, desde + 999);

    if (error) {
      if (
        error.code === "42P01" ||
        error.code === "PGRST200" ||
        /does not exist|schema cache|relationship/i.test(error.message)
      ) {
        return [];
      }
      throw new Error(
        `No se pudieron cargar las solicitudes automáticas: ${error.message}`,
      );
    }

    const pagina = (data ?? []) as unknown as SolicitudDb[];
    filas.push(...pagina);
    if (pagina.length < 1000) break;
  }

  return filas
    .map((solicitud) => ({
      id: solicitud.id,
      termino: solicitud.termino_original.trim(),
      terminoNormalizado: solicitud.termino_normalizado,
      supermercadosObjetivo: supermercadosObjetivo(
        solicitud.supermercados_solicitados ?? [],
      ),
      progreso: solicitud.solicitudes_rastreo_progreso ?? [],
    }))
    .filter(
      (solicitud) =>
        solicitud.termino &&
        solicitud.supermercadosObjetivo.includes(supermercado) &&
        !solicitud.progreso.some(
          (progreso) =>
            progreso.supermercado === supermercado &&
            progreso.estado === "completado",
        ),
    )
    .map((solicitud) => ({
      id: solicitud.id,
      termino: solicitud.termino,
      terminoNormalizado: solicitud.terminoNormalizado,
      supermercadosObjetivo: solicitud.supermercadosObjetivo,
    }));
}

export async function registrarResultadoSolicitudAutomatica({
  solicitud,
  supermercado,
  productosEncontrados,
  error,
}: {
  solicitud: SolicitudAutomatica;
  supermercado: SupermercadoRastreo;
  productosEncontrados: number;
  error?: string;
}): Promise<void> {
  const { error: errorRpc } = await obtenerSupabaseServidor().rpc(
    "registrar_resultado_solicitud_automatica",
    {
      p_solicitud_id: solicitud.id,
      p_supermercado: supermercado,
      p_supermercados_objetivo: solicitud.supermercadosObjetivo,
      p_productos_encontrados: Math.max(0, Math.trunc(productosEncontrados)),
      p_mensaje_error: error ?? null,
    },
  );
  if (errorRpc) {
    throw new Error(
      `No se pudo actualizar la solicitud “${solicitud.termino}”: ${errorRpc.message}`,
    );
  }
}
