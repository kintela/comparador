import "server-only";

import { fetchComoNavegador } from "@/servicios/rastreo/cliente-navegador";
import { ejecutarConReintentos } from "@/servicios/rastreo/reintentos";

import { parsearResultadosEroski } from "./parser-eroski";
import type { ResultadoRastreoEroski } from "./tipos-eroski";

const ORIGEN_EROSKI = "https://supermercado.eroski.es";
const ORIGEN_PETICIONES_EROSKI =
  "https://eroski.eroski-gcp.global.worldline-solutions.com";
const TAMANO_MAXIMO_HTML = 5_000_000;
const RUTAS_CATEGORIA_POR_CONSULTA: Record<string, string> = {
  "huevo campero":
    "/es/supermercado/2059698-frescos/2059760-huevos/2059766-huevos-camperos-y-ecologicos/",
  "huevos camperas":
    "/es/supermercado/2059698-frescos/2059760-huevos/2059766-huevos-camperos-y-ecologicos/",
  "huevos camperos":
    "/es/supermercado/2059698-frescos/2059760-huevos/2059766-huevos-camperos-y-ecologicos/",
};
let inicioSesionEroski: Promise<void> | null = null;

function iniciarSesionEroski() {
  inicioSesionEroski ??= fetchComoNavegador(`${ORIGEN_PETICIONES_EROSKI}/es/`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
    },
  }).then((respuesta) => {
    if (!respuesta.ok) {
      inicioSesionEroski = null;
      throw new Error(`Eroski respondió con estado ${respuesta.status}`);
    }
  });
  return inicioSesionEroski;
}

function normalizarConsultaEroski(consulta: string) {
  return consulta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function claveConsultaEroski(consulta: string) {
  return normalizarConsultaEroski(consulta)
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function construirUrlBusquedaEroski(
  consulta: string,
  pagina = 0,
): string {
  const rutaCategoria = RUTAS_CATEGORIA_POR_CONSULTA[claveConsultaEroski(consulta)];
  const url = new URL(rutaCategoria ?? "/es/search/results/", ORIGEN_EROSKI);
  if (!rutaCategoria) url.searchParams.set("q", normalizarConsultaEroski(consulta));
  if (pagina > 0) url.searchParams.set("pageNumber", pagina.toString());
  return url.toString();
}

export async function rastrearProductosEroski(
  consulta: string,
  pagina = 0,
): Promise<ResultadoRastreoEroski> {
  return ejecutarConReintentos(
    async (intento) => {
      await iniciarSesionEroski();
      const urlOrigen = construirUrlBusquedaEroski(consulta, pagina);
      const urlPeticion = new URL(urlOrigen);
      urlPeticion.hostname = new URL(ORIGEN_PETICIONES_EROSKI).hostname;
      if (intento > 1) urlPeticion.searchParams.set("_intento", String(intento));
      const respuesta = await fetchComoNavegador(urlPeticion, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "es-ES,es;q=0.9",
          Referer: `${ORIGEN_PETICIONES_EROSKI}/es/`,
        },
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
        throw new Error(
          "No se pudieron identificar productos en la respuesta de Eroski",
        );
      }

      return {
        consulta,
        urlOrigen,
        fechaObtencion: new Date().toISOString(),
        totalDeclarado,
        productos,
      };
    },
    { intentos: 3, retrasoInicialMs: 1_500 },
  );
}
