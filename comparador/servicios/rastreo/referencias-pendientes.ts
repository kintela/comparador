import "server-only";

import type { SupermercadoRastreo } from "@/servicios/rastreo/terminos";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

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
};

export type ReferenciaPendiente = {
  identificadorExterno: string;
  nombreOriginal: string;
};

async function obtenerCadenaId(
  supermercado: SupermercadoRastreo,
): Promise<string> {
  const { data: cadena, error } = await obtenerSupabaseServidor()
    .from("cadenas_supermercados")
    .select("id")
    .eq("slug", SLUG_CADENA[supermercado])
    .single();
  if (error || !cadena) {
    throw new Error(
      `No se pudo identificar ${supermercado} para completar su catálogo`,
    );
  }
  return cadena.id;
}

export async function obtenerReferenciasNoActualizadas({
  supermercado,
  desde,
}: {
  supermercado: SupermercadoRastreo;
  desde: string;
}): Promise<ReferenciaPendiente[]> {
  const supabase = obtenerSupabaseServidor();
  const cadenaId = await obtenerCadenaId(supermercado);

  const referencias: ReferenciaPendiente[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("productos_supermercado")
      .select("identificador_externo, nombre_original")
      .eq("cadena_supermercado_id", cadenaId)
      .eq("activo", true)
      .or(`fecha_ultima_deteccion.is.null,fecha_ultima_deteccion.lt.${desde}`)
      .order("fecha_ultima_deteccion", { ascending: true, nullsFirst: true })
      .range(inicio, inicio + 999);
    if (error) {
      throw new Error(
        `No se pudieron cargar referencias pendientes de ${supermercado}: ${error.message}`,
      );
    }

    const pagina = data ?? [];
    referencias.push(
      ...pagina.map((referencia) => ({
        identificadorExterno: referencia.identificador_externo,
        nombreOriginal: referencia.nombre_original,
      })),
    );
    if (pagina.length < 1000) break;
  }
  return referencias;
}

export async function desactivarReferenciasNoEncontradas({
  supermercado,
  identificadores,
}: {
  supermercado: SupermercadoRastreo;
  identificadores: string[];
}): Promise<number> {
  if (identificadores.length === 0) return 0;

  const cadenaId = await obtenerCadenaId(supermercado);
  const { data, error } = await obtenerSupabaseServidor()
    .from("productos_supermercado")
    .update({ activo: false })
    .eq("cadena_supermercado_id", cadenaId)
    .in("identificador_externo", identificadores)
    .select("id");
  if (error) {
    throw new Error(
      `No se pudieron desactivar referencias retiradas de ${supermercado}: ${error.message}`,
    );
  }
  return data?.length ?? 0;
}
