import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoApiDia,
  ProductoDia,
  RespuestaBusquedaDia,
} from "./tipos-dia";

const ORIGEN_DIA = "https://www.dia.es";
const ENDPOINT_BUSQUEDA_DIA = `${ORIGEN_DIA}/api/v1/search-back/search`;
const MAX_PAGINAS_POR_BUSQUEDA = 3;

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function raizPalabra(palabra: string) {
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

function productoRelevante(producto: ProductoApiDia, consulta: string) {
  const palabras = normalizar(consulta)
    .split(" ")
    .filter((palabra) => palabra.length > 1)
    .map(raizPalabra);
  const tokens = normalizar(
    [
      producto.display_name,
      producto.brand,
      producto.l1_category_description,
      producto.l2_category_description,
    ]
      .filter(Boolean)
      .join(" "),
  )
    .split(" ")
    .map(raizPalabra);

  return palabras.every((palabra) => tokens.includes(palabra));
}

function convertirProducto(
  producto: ProductoApiDia,
  consulta: string,
): ProductoDia | null {
  const identificador = producto.object_id ?? producto.sku_id;
  const precioActual = producto.prices?.price;
  if (
    !identificador ||
    !producto.display_name ||
    typeof precioActual !== "number" ||
    !Number.isFinite(precioActual) ||
    precioActual <= 0
  ) {
    return null;
  }

  const precioAnterior = producto.prices?.strikethrough_price;
  const promocionado =
    producto.prices?.is_promo_price === true &&
    typeof precioAnterior === "number" &&
    Number.isFinite(precioAnterior) &&
    precioAnterior > precioActual;
  const descuento = producto.prices?.discount_percentage;
  const textosPromocion = [
    producto.prices?.is_club_price ? "Precio Club DIA" : null,
    promocionado && descuento ? `${descuento}% de descuento` : null,
    producto.stamp_description &&
    !/mejor valorado/i.test(producto.stamp_description)
      ? producto.stamp_description
      : null,
  ].filter(Boolean);
  const categoriaOriginal =
    producto.l2_category_description ?? producto.l1_category_description ?? null;

  return {
    identificadorExterno: identificador,
    ean: null,
    nombreOriginal: producto.display_name.trim(),
    marcaOriginal: producto.brand?.trim() || null,
    categoriaOriginal,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: promocionado ? precioAnterior : precioActual,
    precioPromocional: promocionado ? precioActual : null,
    precioReferencia:
      typeof producto.prices?.price_per_unit === "number"
        ? producto.prices.price_per_unit
        : null,
    unidadReferencia: producto.prices?.measure_unit ?? null,
    textoPromocion: textosPromocion.join(" · ") || null,
    fechaInicioPromocion: null,
    fechaFinPromocion: null,
    disponible:
      typeof producto.units_in_stock !== "number" || producto.units_in_stock > 0,
    urlProducto: producto.url
      ? new URL(producto.url, ORIGEN_DIA).toString()
      : `${ORIGEN_DIA}/search?q=${encodeURIComponent(consulta)}`,
    urlImagen: producto.image
      ? new URL(producto.image, ORIGEN_DIA).toString()
      : null,
  };
}

async function obtenerPagina(consulta: string, pagina: number) {
  const url = new URL(ENDPOINT_BUSQUEDA_DIA);
  url.searchParams.set("q", consulta);
  url.searchParams.set("page", String(pagina));

  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuesta.ok) {
    throw new Error(`DIA respondió con estado ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as RespuestaBusquedaDia;
  if (!Array.isArray(datos.search_items)) {
    throw new Error("DIA no devolvió resultados de búsqueda válidos");
  }
  return {
    datos,
    codigoPostal: datos.cart?.postal_code ?? null,
  };
}

export async function rastrearProductosDia({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoDia[];
  peticionesRealizadas: number;
  codigoPostal: string | null;
}> {
  const productos = new Map<string, ProductoDia>();
  let total = 0;
  let peticionesRealizadas = 0;
  let codigoPostal: string | null = null;

  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_BUSQUEDA; pagina += 1) {
    const resultado = await obtenerPagina(consulta, pagina);
    peticionesRealizadas += 1;
    total = resultado.datos.total_items ?? total;
    codigoPostal = resultado.codigoPostal ?? codigoPostal;

    for (const productoApi of resultado.datos.search_items ?? []) {
      if (!productoRelevante(productoApi, consulta)) continue;
      const producto = convertirProducto(productoApi, consulta);
      if (producto) productos.set(producto.identificadorExterno, producto);
      if (productos.size >= limite) break;
    }

    const paginasTotales = resultado.datos.pagination?.total_pages ?? 1;
    if (productos.size >= limite || pagina >= paginasTotales) break;
  }

  return {
    total,
    productos: [...productos.values()].slice(0, limite),
    peticionesRealizadas,
    codigoPostal,
  };
}
