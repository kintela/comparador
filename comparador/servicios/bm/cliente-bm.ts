import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoApiBm,
  ProductoBm,
  RespuestaCatalogoBm,
} from "./tipos-bm";

const ENDPOINT_BM =
  "https://www.online.bmsupermercados.es/api/rest/V1.0/catalog/product";

function numeroValido(valor: number | undefined): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function convertirProducto(
  producto: ProductoApiBm,
  consulta: string,
): ProductoBm | null {
  const precioNormal = producto.priceData.prices?.find(
    (precio) => precio.id === "PRICE",
  );
  const precioOferta = producto.priceData.prices?.find(
    (precio) => precio.id === "OFFER_PRICE",
  );
  const precio = numeroValido(precioNormal?.value?.centAmount);
  if (!producto.code || !producto.productData?.name || precio === null) return null;

  const marca = producto.productData.brand?.name?.trim() || null;
  const nombreBase = producto.productData.name.trim();
  const nombreOriginal =
    marca && !nombreBase.toLocaleLowerCase("es").startsWith(marca.toLocaleLowerCase("es"))
      ? `${marca} ${nombreBase}`
      : nombreBase;
  const promociones = producto.offers ?? [];

  return {
    identificadorExterno: producto.code,
    ean: producto.ean?.trim() || null,
    nombreOriginal,
    marcaOriginal: marca,
    categoriaOriginal: producto.categories?.[0]?.name?.trim() || null,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio,
    precioPromocional: numeroValido(precioOferta?.value?.centAmount),
    precioReferencia: numeroValido(
      precioOferta?.value?.centUnitAmount ?? precioNormal?.value?.centUnitAmount,
    ),
    unidadReferencia: producto.priceData.unitPriceUnitType?.trim() || null,
    textoPromocion:
      promociones
        .map((oferta) => oferta.shortDescription?.trim())
        .filter(Boolean)
        .join(" · ") || null,
    fechaInicioPromocion: promociones[0]?.from ?? null,
    fechaFinPromocion: promociones[0]?.to ?? null,
    disponible:
      producto.productData.availability === "1" &&
      !producto.productData.temporaryOutOfStock,
    urlProducto: producto.productData.url,
    urlImagen: producto.productData.imageURL ?? null,
  };
}

export async function rastrearProductosBm({
  consulta,
  pagina,
  limite,
}: {
  consulta: string;
  pagina: number;
  limite: number;
}): Promise<{ total: number; hayMas: boolean; productos: ProductoBm[] }> {
  const url = new URL(ENDPOINT_BM);
  url.searchParams.set("page", pagina.toString());
  url.searchParams.set("limit", limite.toString());
  url.searchParams.set("offset", ((pagina - 1) * limite).toString());
  url.searchParams.set("orderById", "13");
  url.searchParams.set("showProducts", "true");
  url.searchParams.set("originProduct", "Grid_Search_Organic");
  url.searchParams.set("showRecommendations", "false");
  url.searchParams.set("showRecipes", "false");
  url.searchParams.set("q", consulta);
  url.searchParams.set("includeFilters", "false");

  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent": "ComparadorPrecios/0.1 (rastreador de precios)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!respuesta.ok) {
    throw new Error(`BM respondió con estado ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as RespuestaCatalogoBm;
  const productos = (datos.products ?? [])
    .map((producto) => convertirProducto(producto, consulta))
    .filter((producto): producto is ProductoBm => producto !== null);

  return {
    total: datos.totalCount,
    hayMas: datos.hasMore,
    productos,
  };
}
