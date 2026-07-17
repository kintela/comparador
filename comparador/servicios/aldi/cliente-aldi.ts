import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoAldi,
  ProductoApiAldi,
  RespuestaBusquedaAldi,
} from "./tipos-aldi";

const APLICACION_ALGOLIA = "L9KNU74IO7";
const CLAVE_PUBLICA_BUSQUEDA = "83df5acd172c42ab174afa4583232b5d";
const INDICE_ALDI_PENINSULA = "an_prd_es_es_pen_products2";
const ENDPOINT_ALDI = `https://${APLICACION_ALGOLIA}-dsn.algolia.net/1/indexes/${INDICE_ALDI_PENINSULA}/query`;
const CATEGORIAS_ESTRICTAS: Record<string, string[]> = {
  leche: ["leche-y-bebidas-vegetales"],
  huevos: ["huevos"],
  pan: ["pan-"],
  aceite: ["aceites-y-vinagres"],
};

function limpiarMarca(marca: string | null | undefined) {
  return marca?.replace(/®/g, "").trim() || null;
}

function tituloCategoria(valor: string | null | undefined) {
  if (!valor) return null;
  const texto = valor.replaceAll("-", " ");
  return texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1);
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productoRelevante(producto: ProductoApiAldi, consulta: string) {
  const consultaNormalizada = normalizar(consulta);
  const categoriasEstrictas = CATEGORIAS_ESTRICTAS[consultaNormalizada];
  if (
    categoriasEstrictas &&
    !categoriasEstrictas.some((categoria) =>
      producto.mainCategoryID?.includes(categoria),
    )
  ) {
    return false;
  }

  const palabras = consultaNormalizada
    .split(" ")
    .filter((palabra) => palabra.length > 2)
    .map((palabra) =>
      palabra.endsWith("es")
        ? palabra.slice(0, -2)
        : palabra.endsWith("s")
          ? palabra.slice(0, -1)
          : palabra,
    );
  const buscable = normalizar(
    `${producto.name} ${producto.mainCategoryID ?? ""}`,
  );
  if (!palabras.every((palabra) => buscable.includes(palabra))) return false;

  if (
    palabras.includes("huevo") &&
    /\b(chocolate|helado|flan|pasta|tagliatelle)\b/.test(buscable)
  ) {
    return false;
  }
  return true;
}

function fechaIso(epoch: number | undefined): string | null {
  if (!epoch || !Number.isFinite(epoch)) return null;
  return new Date(epoch * 1000).toISOString();
}

function convertirProducto(
  producto: ProductoApiAldi,
  consulta: string,
): ProductoAldi | null {
  const precioActual = producto.currentPrice?.priceValue;
  if (
    !producto.objectID ||
    !producto.name ||
    typeof precioActual !== "number" ||
    !Number.isFinite(precioActual)
  ) {
    return null;
  }

  const ahora = Date.now() / 1000;
  const vigente =
    (!producto.currentPrice?.validFrom ||
      producto.currentPrice.validFrom <= ahora) &&
    (!producto.currentPrice?.validUntil ||
      producto.currentPrice.validUntil >= ahora);
  if (!vigente || producto.isComingSoon) return null;

  const precioAnterior = producto.currentPrice?.strikePrice?.strikePriceValue;
  const rebajado =
    typeof precioAnterior === "number" &&
    Number.isFinite(precioAnterior) &&
    precioAnterior > precioActual;
  const promocionVigente = (producto.promotionPrices ?? []).some(
    (promocion) =>
      (!promocion.validFrom || promocion.validFrom <= ahora) &&
      (!promocion.validUntil || promocion.validUntil >= ahora),
  );
  const etiquetas = producto.currentPrice?.priceTagLabels;
  const textoPromocion = [
    etiquetas?.promoText1,
    etiquetas?.promoText2,
    etiquetas?.textualAddition,
  ]
    .filter(Boolean)
    .join(" · ");
  const referencia = producto.currentPrice?.basePrice?.[0];
  const imagen = producto.assets?.find((asset) => asset.type === "primary")?.url;
  const nombre = producto.salesUnit
    ? `${producto.name.trim()}, ${producto.salesUnit.trim()}`
    : producto.name.trim();

  return {
    identificadorExterno: producto.objectID,
    ean: null,
    nombreOriginal: nombre,
    marcaOriginal: limpiarMarca(producto.brandName),
    categoriaOriginal: tituloCategoria(producto.mainCategoryID),
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: rebajado ? precioAnterior : precioActual,
    precioPromocional: rebajado ? precioActual : null,
    precioReferencia:
      typeof referencia?.basePriceValue === "number"
        ? referencia.basePriceValue
        : null,
    unidadReferencia: referencia?.basePriceScale ?? null,
    textoPromocion:
      textoPromocion || (promocionVigente ? "Oferta semanal" : null),
    fechaInicioPromocion:
      rebajado || promocionVigente
        ? fechaIso(producto.currentPrice?.validFrom)
        : null,
    fechaFinPromocion:
      rebajado || promocionVigente
        ? fechaIso(producto.currentPrice?.validUntil)
        : null,
    disponible: producto.isAvailable !== false,
    urlProducto: producto.productSlug
      ? `https://www.aldi.es/producto/${producto.productSlug}.html`
      : "https://www.aldi.es/productos.html",
    urlImagen: imagen ?? null,
  };
}

export async function rastrearProductosAldi({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{ total: number; productos: ProductoAldi[] }> {
  const respuesta = await fetch(ENDPOINT_ALDI, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-algolia-application-id": APLICACION_ALGOLIA,
      "x-algolia-api-key": CLAVE_PUBLICA_BUSQUEDA,
      "User-Agent": "ComparadorPrecios/0.1 (rastreador de precios)",
    },
    body: JSON.stringify({
      query: consulta,
      hitsPerPage: Math.min(Math.max(limite * 3, limite), 60),
      attributesToRetrieve: [
        "objectID",
        "name",
        "brandName",
        "productSlug",
        "isAvailable",
        "isComingSoon",
        "salesUnit",
        "mainCategoryID",
        "currentPrice",
        "promotionPrices",
        "assets",
        "productReferences",
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!respuesta.ok) {
    throw new Error(`ALDI respondió con estado ${respuesta.status}`);
  }
  const datos = (await respuesta.json()) as RespuestaBusquedaAldi;
  const productos = (datos.hits ?? [])
    .filter((producto) => productoRelevante(producto, consulta))
    .map((producto) => convertirProducto(producto, consulta))
    .filter((producto): producto is ProductoAldi => producto !== null)
    .slice(0, limite);

  return { total: datos.nbHits ?? productos.length, productos };
}
