import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoApiCarrefour,
  ProductoCarrefour,
  RespuestaApiCarrefour,
} from "./tipos-carrefour";

const ORIGEN_CARREFOUR = "https://www.carrefour.es";
const ENDPOINT_BUSQUEDA =
  "https://api.empathy.co/search/v1/query/carrefour/search";
export const PUNTO_VENTA_CARREFOUR =
  process.env.CARREFOUR_STORE_ID?.trim() || "005457";
export const CODIGO_POSTAL_CARREFOUR =
  process.env.CARREFOUR_CODIGO_POSTAL?.trim() || "48980";
const MAX_RESULTADOS_POR_PETICION = 20;

function numeroPositivo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0
    ? valor
    : null;
}

function unidadReferencia(producto: ProductoApiCarrefour): string | null {
  const unidad = (producto.measure_unit ?? producto.unit_short_name)
    ?.trim()
    .toLocaleUpperCase("es");
  if (!unidad) return null;
  if (unidad === "L" || unidad.includes("LITR")) return "L";
  if (unidad === "KG" || unidad.includes("KILOG")) return "KG";
  if (unidad === "UD" || unidad.includes("UNIT")) return "UD";
  return unidad;
}

function convertirProducto(
  producto: ProductoApiCarrefour,
  consulta: string,
): ProductoCarrefour | null {
  const identificador = producto.product_id?.trim();
  const nombre = producto.display_name?.trim();
  const precioActual = numeroPositivo(producto.active_price);
  if (!identificador || !nombre || precioActual === null) return null;

  const precioLista = numeroPositivo(producto.list_price);
  const rebajado = precioLista !== null && precioLista > precioActual;
  const factor = numeroPositivo(producto.unit_conversion_factor);
  const precioReferencia =
    factor !== null ? Number((precioActual / factor).toFixed(2)) : null;
  const ruta =
    producto.url_for_play_service ?? producto.urls?.food ?? "/supermercado/";
  const ean = producto.ean13?.trim() || null;
  const imagenOficial =
    producto.image_for_play_service ?? producto.image_path?.food ?? null;

  return {
    identificadorExterno: identificador,
    ean,
    nombreOriginal: nombre,
    marcaOriginal: producto.brand?.trim() || null,
    // Carrefour publica aquí un identificador interno, no un nombre legible.
    categoriaOriginal: null,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: rebajado ? precioLista : precioActual,
    precioPromocional: rebajado ? precioActual : null,
    precioReferencia,
    unidadReferencia: unidadReferencia(producto),
    textoPromocion: rebajado ? "Oferta Carrefour" : null,
    fechaInicioPromocion: null,
    fechaFinPromocion: null,
    disponible:
      producto.sale_point_available !== false && producto.active_food !== false,
    urlProducto: ruta.startsWith("http") ? ruta : `${ORIGEN_CARREFOUR}${ruta}`,
    urlImagen:
      imagenOficial ??
      (ean ? `/api/imagenes/carrefour?ean=${encodeURIComponent(ean)}` : null),
  };
}

export async function rastrearProductosCarrefour({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoCarrefour[];
  peticionesRealizadas: number;
}> {
  const url = new URL(ENDPOINT_BUSQUEDA);
  url.searchParams.set("query", consulta);
  url.searchParams.set("lang", "es");
  url.searchParams.set("scope", "desktop");
  url.searchParams.set("store", PUNTO_VENTA_CARREFOUR);
  url.searchParams.set("catalog", "food");
  url.searchParams.set(
    "rows",
    String(Math.min(Math.max(1, limite), MAX_RESULTADOS_POR_PETICION)),
  );
  url.searchParams.set("start", "0");

  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Carrefour respondió con estado ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as RespuestaApiCarrefour;
  const documentos = datos.catalog?.content;
  if (!Array.isArray(documentos)) {
    throw new Error("Carrefour no devolvió resultados de búsqueda válidos");
  }

  const productos = new Map<string, ProductoCarrefour>();
  for (const documento of documentos) {
    const producto = convertirProducto(documento, consulta);
    if (producto) productos.set(producto.identificadorExterno, producto);
    if (productos.size >= limite) break;
  }

  return {
    total:
      datos.catalog?.pagination?.total ??
      datos.catalog?.numFound ??
      productos.size,
    productos: [...productos.values()].slice(0, limite),
    peticionesRealizadas: 1,
  };
}
