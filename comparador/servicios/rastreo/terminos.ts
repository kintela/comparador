import "server-only";

import { CONSULTAS_RASTREO_HABITUALES } from "@/servicios/rastreo/configuracion";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export const SUPERMERCADOS_RASTREO = [
  "eroski",
  "bm",
  "mercadona",
  "aldi",
  "dia",
  "lidl",
  "alcampo",
  "lupa",
] as const;

export type SupermercadoRastreo = (typeof SUPERMERCADOS_RASTREO)[number];

type TerminoRastreoDb = {
  termino: string;
  supermercados: string[];
};

export function normalizarTerminoRastreo(termino: string): string {
  return termino
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function obtenerTerminosRastreo(
  supermercado: SupermercadoRastreo,
): Promise<string[]> {
  const { data, error } = await obtenerSupabaseServidor()
    .from("terminos_rastreo")
    .select("termino, supermercados")
    .eq("activo", true)
    .order("prioridad", { ascending: true })
    .order("termino", { ascending: true });

  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
      return [...CONSULTAS_RASTREO_HABITUALES];
    }
    throw new Error(`No se pudieron cargar los términos de rastreo: ${error.message}`);
  }

  const terminos = ((data ?? []) as TerminoRastreoDb[])
    .filter(
      (item) =>
        item.supermercados.length === 0 ||
        item.supermercados.includes(supermercado),
    )
    .map((item) => item.termino.trim())
    .filter(Boolean);

  return terminos;
}
