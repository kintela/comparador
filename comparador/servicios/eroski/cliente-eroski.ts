import "server-only";

import { parsearResultadosEroski } from "./parser-eroski";
import type { ResultadoRastreoEroski } from "./tipos-eroski";

const ORIGEN_EROSKI = "https://supermercado.eroski.es";
const TAMANO_MAXIMO_HTML = 5_000_000;

function normalizarConsultaEroski(consulta: string) {
  return consulta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function construirUrlBusquedaEroski(
  consulta: string,
  pagina = 0,
): string {
  const url = new URL("/es/search/results/", ORIGEN_EROSKI);
  url.searchParams.set("q", normalizarConsultaEroski(consulta));
  if (pagina > 0) url.searchParams.set("pageNumber", pagina.toString());
  return url.toString();
}

export async function rastrearProductosEroski(
  consulta: string,
  pagina = 0,
): Promise<ResultadoRastreoEroski> {
  const urlOrigen = construirUrlBusquedaEroski(consulta, pagina);
  const respuesta = await fetch(urlOrigen, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent":
        "ComparadorPrecios/0.1 (rastreador de precios en desarrollo)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!respuesta.ok) {
    throw new Error(`Eroski respondió con estado ${respuesta.status}`);
  }

  const html = await respuesta.text();
  if (html.length > TAMANO_MAXIMO_HTML) {
    throw new Error("La respuesta de Eroski supera el tamaño permitido");
  }

  const { totalDeclarado, productos } = parsearResultadosEroski(html);
  if (productos.length === 0) {
    throw new Error("No se pudieron identificar productos en la respuesta de Eroski");
  }

  return {
    consulta,
    urlOrigen,
    fechaObtencion: new Date().toISOString(),
    totalDeclarado,
    productos,
  };
}
