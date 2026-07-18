import "server-only";

import { normalizarTerminoRastreo } from "@/servicios/rastreo/terminos";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

type TerminoConocido = {
  termino: string;
  termino_normalizado: string;
};

export type ResolucionTermino = {
  termino: string;
  normalizado: string;
  corregido: boolean;
  variantesBusqueda: string[];
};

function distanciaEdicion(textoA: string, textoB: string): number {
  const anterior = Array.from({ length: textoB.length + 1 }, (_, indice) => indice);

  for (let indiceA = 1; indiceA <= textoA.length; indiceA += 1) {
    const actual = [indiceA];
    for (let indiceB = 1; indiceB <= textoB.length; indiceB += 1) {
      const coste = textoA[indiceA - 1] === textoB[indiceB - 1] ? 0 : 1;
      actual[indiceB] = Math.min(
        actual[indiceB - 1] + 1,
        anterior[indiceB] + 1,
        anterior[indiceB - 1] + coste,
      );
    }
    anterior.splice(0, anterior.length, ...actual);
  }

  return anterior[textoB.length];
}

function crearResolucion(
  original: string,
  conocido?: TerminoConocido,
): ResolucionTermino {
  const normalizadoOriginal = normalizarTerminoRastreo(original);
  const termino = conocido?.termino.trim() || original.trim();
  const normalizado =
    conocido?.termino_normalizado || normalizarTerminoRastreo(termino);

  return {
    termino,
    normalizado,
    corregido: normalizado !== normalizadoOriginal,
    variantesBusqueda: [
      ...new Set([termino, normalizado, original.trim()].filter(Boolean)),
    ],
  };
}

export async function resolverTerminoRastreo(
  original: string,
): Promise<ResolucionTermino> {
  const normalizado = normalizarTerminoRastreo(original);
  if (!normalizado) return crearResolucion(original);

  const { data, error } = await obtenerSupabaseServidor()
    .from("terminos_rastreo")
    .select("termino, termino_normalizado")
    .eq("activo", true);

  if (error) {
    if (error.code !== "42P01") {
      console.error("No se pudieron resolver erratas de búsqueda:", error.message);
    }
    return crearResolucion(original);
  }

  const conocidos = (data ?? []) as TerminoConocido[];
  const exacto = conocidos.find(
    (termino) => termino.termino_normalizado === normalizado,
  );
  if (exacto) return crearResolucion(original, exacto);

  const palabras = normalizado.split(" ").length;
  const distanciaMaxima = normalizado.length > 8 ? 2 : 1;
  const candidatos = conocidos
    .filter(
      (termino) =>
        termino.termino_normalizado.split(" ").length === palabras,
    )
    .map((termino) => ({
      termino,
      distancia: distanciaEdicion(normalizado, termino.termino_normalizado),
    }))
    .filter((candidato) => candidato.distancia <= distanciaMaxima)
    .sort((a, b) => a.distancia - b.distancia);

  const mejor = candidatos[0];
  const segundo = candidatos[1];
  if (!mejor || (segundo && segundo.distancia === mejor.distancia)) {
    return crearResolucion(original);
  }
  return crearResolucion(original, mejor.termino);
}
