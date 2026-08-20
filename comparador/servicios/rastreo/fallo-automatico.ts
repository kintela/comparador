import "server-only";

import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

import type { SupermercadoRastreo } from "./terminos";

const SLUG_CADENA: Record<SupermercadoRastreo, string> = {
  eroski: "eroski",
  bm: "bm-supermercados",
  mercadona: "mercadona",
  aldi: "aldi",
  dia: "dia",
  lidl: "lidl",
  alcampo: "alcampo",
  lupa: "lupa",
  coviran: "coviran",
  carrefour: "carrefour",
  costco: "costco",
  primaprix: "primaprix",
  "el-corte-ingles": "el-corte-ingles",
};

export async function registrarFalloRastreoAutomatico(
  supermercado: SupermercadoRastreo,
  mensaje: string,
  desde: string,
) {
  const supabase = obtenerSupabaseServidor();
  const { data: cadena, error: errorCadena } = await supabase
    .from("cadenas_supermercados")
    .select("id")
    .eq("slug", SLUG_CADENA[supermercado])
    .single();
  if (errorCadena || !cadena) {
    throw new Error(
      `No se encontró la cadena: ${errorCadena?.message ?? supermercado}`,
    );
  }

  const { data: ejecucionExistente } = await supabase
    .from("ejecuciones_rastreo")
    .select("id")
    .eq("cadena_supermercado_id", cadena.id)
    .eq("tipo_rastreo", "automatico")
    .gte("fecha_inicio", desde)
    .limit(1)
    .maybeSingle();
  if (ejecucionExistente) return;

  const { data: ultimaEjecucion } = await supabase
    .from("ejecuciones_rastreo")
    .select("tienda_id")
    .eq("cadena_supermercado_id", cadena.id)
    .not("tienda_id", "is", null)
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("ejecuciones_rastreo").insert({
    cadena_supermercado_id: cadena.id,
    tienda_id: ultimaEjecucion?.tienda_id ?? null,
    tipo_rastreo: "automatico",
    estado: "error",
    fecha_inicio: ahora,
    fecha_fin: ahora,
    productos_detectados: 0,
    productos_nuevos: 0,
    precios_insertados: 0,
    errores_detectados: 1,
    mensaje_error: mensaje,
    detalles: { fase: "inicio" },
  });
  if (error) throw new Error(error.message);
}
