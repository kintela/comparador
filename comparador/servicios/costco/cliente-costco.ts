import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoCostco,
  ProductoCostcoApi,
  RespuestaBusquedaCostco,
  RespuestaProductosCostco,
} from "./tipos-costco";

const ORIGEN_COSTCO = "https://sameday.costco.es";
const ENDPOINT_GRAPHQL = `${ORIGEN_COSTCO}/graphql`;
const HASH_BUSQUEDA =
  "8b04dde9ac6078497aed4bb629fcc10661c9e217c0dd424017afebab4fe9ea4f";
const HASH_PRODUCTOS =
  "9ad66078d7fa81276b6bd4eb6a6f6fcdd1f4022ff0c3f5b4663c62877f06692a";
const USER_AGENT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export const COSTCO_SHOP_ID =
  process.env.COSTCO_SHOP_ID?.trim() || "16646045";
export const COSTCO_RETAILER_LOCATION_ID =
  process.env.COSTCO_RETAILER_LOCATION_ID?.trim() || "567915";
export const COSTCO_ZONE_ID =
  process.env.COSTCO_ZONE_ID?.trim() || "2951";
export const CODIGO_POSTAL_COSTCO =
  process.env.COSTCO_CODIGO_POSTAL?.trim() || "48980";

function cookiesDeRespuesta(respuesta: Response): string {
  const cabeceras = respuesta.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const valores =
    cabeceras.getSetCookie?.() ??
    (respuesta.headers.get("set-cookie")
      ? [respuesta.headers.get("set-cookie") as string]
      : []);
  const cookies = valores
    .flatMap((valor) =>
      [...valor.matchAll(/(?:^|,\s*)([^=;,\s]+=[^;,]+)/g)].map(
        (coincidencia) => coincidencia[1],
      ),
    )
    .filter(
      (cookie) =>
        cookie.startsWith("__Host-instacart_sid=") ||
        cookie.startsWith("X-IC-bcx="),
    );
  if (!cookies.some((cookie) => cookie.startsWith("__Host-instacart_sid="))) {
    throw new Error("Costco no pudo iniciar una sesión anónima");
  }
  return cookies.join("; ");
}

async function iniciarSesion(consulta: string): Promise<string> {
  const url = new URL("/store/costco-espana/s", ORIGEN_COSTCO);
  url.searchParams.set("k", consulta);
  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent": USER_AGENT,
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Costco respondió con estado ${respuesta.status}`);
  }
  return cookiesDeRespuesta(respuesta);
}

function crearUrlGraphql(
  operacion: string,
  variables: Record<string, unknown>,
  hash: string,
): URL {
  const url = new URL(ENDPOINT_GRAPHQL);
  url.searchParams.set("operationName", operacion);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set(
    "extensions",
    JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: hash },
    }),
  );
  return url;
}

async function consultarGraphql<T>({
  operacion,
  variables,
  hash,
  cookies,
  capaVista = false,
}: {
  operacion: string;
  variables: Record<string, unknown>;
  hash: string;
  cookies: string;
  capaVista?: boolean;
}): Promise<T> {
  const respuesta = await fetch(crearUrlGraphql(operacion, variables, hash), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Accept-Language": "es-ES,es;q=0.9",
      "Content-Type": "application/json",
      Cookie: cookies,
      "User-Agent": USER_AGENT,
      "x-client-identifier": "web",
      ...(capaVista ? { "x-ic-view-layer": "true" } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Costco respondió con estado ${respuesta.status}`);
  }
  return (await respuesta.json()) as T;
}

function mensajeErrores(
  respuesta: { errors?: Array<{ message?: string }> },
  contexto: string,
): string | null {
  const errores = respuesta.errors
    ?.map((error) => error.message?.trim())
    .filter((mensaje): mensaje is string => Boolean(mensaje));
  return errores?.length ? `${contexto}: ${errores.join("; ")}` : null;
}

async function buscarIdentificadores({
  consulta,
  limite,
  cookies,
}: {
  consulta: string;
  limite: number;
  cookies: string;
}): Promise<string[]> {
  const respuesta = await consultarGraphql<RespuestaBusquedaCostco>({
    operacion: "SearchResultsPlacements",
    hash: HASH_BUSQUEDA,
    cookies,
    capaVista: true,
    variables: {
      action: null,
      query: consulta,
      pageViewId: crypto.randomUUID(),
      elevatedProductId: null,
      searchSource: "search",
      filters: [],
      disableReformulation: false,
      disableLlm: false,
      forceInspiration: false,
      orderBy: "bestMatch",
      clusterId: null,
      includeDebugInfo: false,
      clusteringStrategy: null,
      contentManagementSearchParams: { itemGridColumnCount: 3 },
      shopId: COSTCO_SHOP_ID,
      postalCode: CODIGO_POSTAL_COSTCO,
      zoneId: COSTCO_ZONE_ID,
      first: Math.min(24, Math.max(8, limite)),
    },
  });
  const error = mensajeErrores(respuesta, "La búsqueda de Costco falló");
  if (error) throw new Error(error);

  return [
    ...new Set(
      (respuesta.data?.searchResultsPlacements?.placements ?? []).flatMap(
        (placement) => placement.content?.itemIds ?? [],
      ),
    ),
  ].slice(0, limite);
}

async function cargarProductos(
  identificadores: string[],
  cookies: string,
): Promise<ProductoCostcoApi[]> {
  const productos: ProductoCostcoApi[] = [];
  for (let inicio = 0; inicio < identificadores.length; inicio += 10) {
    const respuesta = await consultarGraphql<RespuestaProductosCostco>({
      operacion: "Items",
      hash: HASH_PRODUCTOS,
      cookies,
      capaVista: true,
      variables: {
        ids: identificadores.slice(inicio, inicio + 10),
        shopId: COSTCO_SHOP_ID,
        zoneId: COSTCO_ZONE_ID,
        postalCode: CODIGO_POSTAL_COSTCO,
      },
    });
    const error = mensajeErrores(respuesta, "Costco no pudo cargar productos");
    if (error) throw new Error(error);
    productos.push(...(respuesta.data?.items ?? []));
  }
  return productos;
}

function extraerPrecio(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const valor = Number(
    texto
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

function precioReferencia(
  producto: ProductoCostcoApi,
): { precio: number | null; unidad: string | null } {
  const texto = producto.price?.viewSection?.itemDetails?.pricePerUnitString;
  const precio = extraerPrecio(texto);
  if (!texto || precio === null) return { precio: null, unidad: null };
  const unidad = texto.split("/").at(-1)?.trim().toLocaleUpperCase("es") ?? null;
  return { precio, unidad };
}

function convertirProducto(
  producto: ProductoCostcoApi,
  consulta: string,
): ProductoCostco | null {
  const identificador = producto.productId?.trim();
  const nombre = producto.name?.trim();
  const precioActual = extraerPrecio(
    producto.price?.viewSection?.priceValueString,
  );
  if (!identificador || !nombre || precioActual === null) return null;

  const precioCompleto = extraerPrecio(
    producto.price?.viewSection?.fullPriceString ??
      producto.price?.viewSection?.itemDetails?.fullPriceString ??
      producto.price?.viewSection?.itemCard?.fullPriceString,
  );
  const enOferta =
    (precioCompleto !== null && precioCompleto > precioActual) ||
    Object.values(
      producto.viewSection?.trackingProperties?.on_sale_ind ?? {},
    ).some(Boolean) ||
    Boolean(producto.price?.viewSection?.itemPromotions?.length) ||
    Boolean(producto.price?.viewSection?.secondaryPromotion);
  const formato =
    producto.price?.viewSection?.itemDetails?.pricingUnitString ??
    producto.price?.viewSection?.itemCard?.pricingUnitString ??
    producto.size;
  const nombreConFormato =
    formato && !nombre.toLocaleLowerCase("es").includes(formato.toLocaleLowerCase("es"))
      ? `${nombre}, ${formato}`
      : nombre;
  const referencia = precioReferencia(producto);
  const imagen =
    producto.viewSection?.itemTransparentImage?.url ??
    producto.viewSection?.itemImage?.url ??
    null;

  return {
    identificadorExterno: identificador,
    ean: null,
    nombreOriginal: nombreConFormato,
    marcaOriginal: producto.brandName?.trim() || null,
    categoriaOriginal:
      producto.viewSection?.trackingProperties?.product_category_name?.trim() ||
      null,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: precioCompleto && precioCompleto > precioActual
      ? precioCompleto
      : precioActual,
    precioPromocional: enOferta ? precioActual : null,
    precioReferencia: referencia.precio,
    unidadReferencia: referencia.unidad,
    textoPromocion: enOferta
      ? producto.price?.viewSection?.itemCard?.discountHeaderString?.trim() ||
        "Oferta Costco"
      : null,
    fechaInicioPromocion: null,
    fechaFinPromocion: null,
    disponible:
      producto.availability?.available !== false &&
      producto.availability?.stockLevel !== "outOfStock",
    urlProducto:
      producto.productCanonicalUrl?.canonicalUrl ??
      `${ORIGEN_COSTCO}/store/costco-espana/products/${producto.evergreenUrl ?? identificador}`,
    urlImagen: imagen,
  };
}

export async function rastrearProductosCostco({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoCostco[];
  peticionesRealizadas: number;
}> {
  const cookies = await iniciarSesion(consulta);
  const identificadores = await buscarIdentificadores({
    consulta,
    limite,
    cookies,
  });
  if (identificadores.length === 0) {
    return { total: 0, productos: [], peticionesRealizadas: 2 };
  }

  const datos = await cargarProductos(identificadores, cookies);
  const productos = new Map<string, ProductoCostco>();
  for (const dato of datos) {
    const producto = convertirProducto(dato, consulta);
    if (producto) productos.set(producto.identificadorExterno, producto);
  }
  return {
    total: identificadores.length,
    productos: [...productos.values()].slice(0, limite),
    peticionesRealizadas: 2 + Math.ceil(identificadores.length / 10),
  };
}
