import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoApiLidl,
  ProductoLidl,
  RespuestaBusquedaLidl,
} from "./tipos-lidl";

const ORIGEN_LIDL = "https://www.lidl.es";
const ENDPOINT_BUSQUEDA = `${ORIGEN_LIDL}/q/api/search`;
const REGION_VIZCAYA = "16";
const RESULTADOS_POR_PAGINA = 48;
const MAX_PAGINAS_POR_BUSQUEDA = 1;
const CATEGORIAS_ESTRICTAS: Record<string, string[]> = {
  aceite: ["aceites y grasas"],
};

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

function productoRelevante(producto: ProductoApiLidl, consulta: string) {
  if (producto.category !== "Food") return false;
  const consultaNormalizada = normalizar(consulta);
  const palabras = consultaNormalizada
    .split(" ")
    .filter((palabra) => palabra.length > 1)
    .map(raizPalabra);
  const tokens = normalizar(
    [
      producto.title,
      producto.keyfacts?.title,
      producto.brand?.name,
    ]
      .filter(Boolean)
      .join(" "),
  )
    .split(" ")
    .map(raizPalabra);
  if (!palabras.every((palabra) => tokens.includes(palabra))) return false;

  const categorias = CATEGORIAS_ESTRICTAS[consultaNormalizada];
  return (
    !categorias ||
    categorias.some((categoria) =>
      normalizar(producto.keyfacts?.wonCategoryPrimary ?? "").includes(categoria),
    )
  );
}

function numeroFinito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

function extraerPrecioReferencia(texto: string | undefined) {
  if (!texto) return { precio: null, unidad: null };
  const coincidencia = texto
    .replaceAll("&", "/")
    .match(/(\d+(?:[.,]\d+)?)\s*€\s*\/?\s*(kg|l|ud)\b/i);
  if (!coincidencia) return { precio: null, unidad: null };
  const precio = Number(coincidencia[1].replace(",", "."));
  return {
    precio: Number.isFinite(precio) ? precio : null,
    unidad: coincidencia[2].toLocaleUpperCase("es"),
  };
}

function convertirProducto(
  producto: ProductoApiLidl,
  consulta: string,
): ProductoLidl | null {
  const identificador = producto.erpNumber ?? producto.productId?.toString();
  const nombre = producto.title ?? producto.keyfacts?.title;
  const region = producto.regionsV2?.[REGION_VIZCAYA];
  if (!identificador || !nombre || region?.status !== "ONLINE") return null;

  const precioNormal = producto.price?.price;
  const precioClub = producto.lidlPlus
    ?.map((oferta) => oferta.price?.price)
    .find(numeroFinito);
  const precioActual = numeroFinito(precioNormal) ? precioNormal : precioClub;
  if (!numeroFinito(precioActual)) return null;

  const precioAnterior = producto.price?.oldPrice;
  const descuentoGeneral =
    numeroFinito(precioAnterior) && precioAnterior > precioActual;
  const descuentoClub =
    numeroFinito(precioClub) &&
    numeroFinito(precioNormal) &&
    precioClub < precioNormal;
  const precioPromocional = descuentoClub
    ? precioClub
    : descuentoGeneral
      ? precioActual
      : null;
  const precioBase = descuentoClub
    ? precioNormal
    : descuentoGeneral
      ? precioAnterior
      : precioActual;
  const ofertaClub = producto.lidlPlus?.find((oferta) =>
    numeroFinito(oferta.price?.price),
  );
  const porcentaje = producto.price?.discount?.percentageDiscount;
  const textosPromocion = [
    ofertaClub?.lidlPlusText,
    descuentoGeneral && porcentaje ? `${porcentaje}% de descuento` : null,
    descuentoGeneral ? producto.price?.discount?.bargainHintText : null,
  ].filter(Boolean);
  const referencia = extraerPrecioReferencia(
    ofertaClub?.price?.basePrice?.text ?? producto.price?.basePrice?.text,
  );
  const categoriaOriginal =
    producto.keyfacts?.wonCategoryPrimary?.split("/").at(-1)?.trim() ?? null;
  const marca =
    producto.brand?.showBrand !== false &&
    producto.brand?.name &&
    producto.brand.name !== "-"
      ? producto.brand.name.replace(/®/g, "").trim()
      : null;

  return {
    identificadorExterno: identificador,
    ean: null,
    nombreOriginal: nombre.trim(),
    marcaOriginal: marca,
    categoriaOriginal,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: precioBase,
    precioPromocional,
    precioReferencia: referencia.precio,
    unidadReferencia: referencia.unidad,
    textoPromocion: textosPromocion.join(" · ") || null,
    fechaInicioPromocion:
      precioPromocional !== null
        ? (ofertaClub?.price?.startDate ?? producto.price?.startDate ?? null)
        : null,
    fechaFinPromocion:
      precioPromocional !== null
        ? (ofertaClub?.price?.endDate ?? producto.price?.endDate ?? null)
        : null,
    disponible: producto.stockAvailability?.availabilityIndicator !== 2,
    urlProducto: producto.canonicalUrl
      ? new URL(producto.canonicalUrl, ORIGEN_LIDL).toString()
      : `${ORIGEN_LIDL}/q/search?q=${encodeURIComponent(consulta)}`,
    urlImagen: producto.image ?? null,
  };
}

async function obtenerPagina(consulta: string, pagina: number) {
  const url = new URL(ENDPOINT_BUSQUEDA);
  url.searchParams.set("q", consulta);
  url.searchParams.set("fetchsize", String(RESULTADOS_POR_PAGINA));
  url.searchParams.set("locale", "es_ES");
  url.searchParams.set("assortment", "ES");
  url.searchParams.set("offset", String((pagina - 1) * RESULTADOS_POR_PAGINA));
  url.searchParams.set("version", "2.1.0");

  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/mindshift.search+json, application/json",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent": "ComparadorPrecios/0.1 (rastreador de precios)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Lidl respondió con estado ${respuesta.status}`);
  }
  const datos = (await respuesta.json()) as RespuestaBusquedaLidl;
  if (!Array.isArray(datos.items)) {
    throw new Error("Lidl no devolvió resultados de búsqueda válidos");
  }
  return datos;
}

export async function rastrearProductosLidl({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoLidl[];
  peticionesRealizadas: number;
}> {
  const productos = new Map<string, ProductoLidl>();
  let total = 0;
  let peticionesRealizadas = 0;

  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_BUSQUEDA; pagina += 1) {
    const datos = await obtenerPagina(consulta, pagina);
    peticionesRealizadas += 1;
    total = datos.numFound ?? total;

    for (const item of datos.items ?? []) {
      const productoApi = item.gridbox?.data;
      if (!productoApi || !productoRelevante(productoApi, consulta)) continue;
      const producto = convertirProducto(productoApi, consulta);
      if (producto) productos.set(producto.identificadorExterno, producto);
      if (productos.size >= limite) break;
    }

    const offsetSiguiente = pagina * RESULTADOS_POR_PAGINA;
    if (productos.size >= limite || offsetSiguiente >= total) break;
  }

  return {
    total,
    productos: [...productos.values()].slice(0, limite),
    peticionesRealizadas,
  };
}
