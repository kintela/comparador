import "server-only";

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";
import { fetchComoNavegador } from "@/servicios/rastreo/cliente-navegador";
import { ejecutarConReintentos } from "@/servicios/rastreo/reintentos";

import type { ProductoElCorteIngles } from "./tipos-el-corte-ingles";

const ORIGEN_EL_CORTE_INGLES = "https://www.elcorteingles.es";
const CENTRO_ENTREGA_REFERENCIA = "0130";
const MAX_RESULTADOS_POR_PETICION = 24;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const MARCADOR_ESTADO = "window.__MOONSHINE_STATE__ = ";
const FIN_ESTADO =
  "window.__MOONSHINE_STATE__.__fingerprint";

type VarianteEstadoElCorteIngles = {
  price?: number;
  sale_price?: number;
  discount?: number;
  pumOrPackComposition?: string;
  add_to_cart?: string;
  gtin?: string;
};

type ProductoEstadoElCorteIngles = {
  id?: string;
  product_original_id?: string;
  title?: string;
  description?: string;
  _uri?: string;
  _status?: string;
  brand?: { name?: string };
  _single_sku?: { gtin?: string };
  image?: {
    default_source?: string;
    sources?: { small?: string; medium?: string; big?: string };
  };
  priority_image?: {
    default_source?: string;
    sources?: { small?: string; medium?: string; big?: string };
  };
  _my_colors?: Array<{
    image?: string;
    variants?: VarianteEstadoElCorteIngles[];
  }>;
};

type EstadoElCorteIngles = {
  blocks?: Array<{
    products?: ProductoEstadoElCorteIngles[];
    _datalayer?: Array<{ page?: { total_products?: number } }>;
  }>;
};

function numeroPositivo(texto: string | undefined): number | null {
  if (!texto) return null;
  const coincidencia = texto.match(/\d[\d.]*,\d{1,2}|\d+(?:[.,]\d{1,2})?/);
  if (!coincidencia) return null;
  const numero = Number(
    coincidencia[0].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."),
  );
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function identificadorDesdeUrl(url: string): string | null {
  try {
    const ruta = new URL(url, ORIGEN_EL_CORTE_INGLES).pathname;
    return ruta.match(/\/B?(\d{12,})-/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function unidadReferencia(texto: string): string | null {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es");
  if (normalizado.includes("LITRO") || /\/\s*L\b/.test(normalizado)) return "L";
  if (normalizado.includes("KG") || normalizado.includes("KILO")) return "KG";
  if (
    normalizado.includes("UNIDAD") ||
    normalizado.includes("DOCENA") ||
    /\/\s*UD\b/.test(normalizado)
  ) {
    return "UD";
  }
  if (normalizado.includes("100 ML")) return "100 ML";
  if (normalizado.includes("100 G")) return "100 G";
  return null;
}

function pesoPiezaVariableKg(nombre: string, tieneReferencia: boolean) {
  if (tieneReferencia) return null;
  const coincidencia = nombre.match(
    /\b(?:peso\s+aproximado\s+)?pieza\s+(\d+(?:[.,]\d+)?)\s*kg\b/i,
  );
  if (!coincidencia) return null;
  const peso = Number(coincidencia[1].replace(",", "."));
  return Number.isFinite(peso) && peso > 0 ? peso : null;
}

function redondearPrecio(precio: number) {
  return Math.round(precio * 100) / 100;
}

function extraerEstado(html: string): EstadoElCorteIngles | null {
  const inicioMarcador = html.indexOf(MARCADOR_ESTADO);
  if (inicioMarcador < 0) return null;
  const inicio = inicioMarcador + MARCADOR_ESTADO.length;
  const finMarcador = html.indexOf(FIN_ESTADO, inicio);
  if (finMarcador < 0) return null;
  const finAsignacion = html.lastIndexOf(";", finMarcador);
  if (finAsignacion <= inicio) return null;

  try {
    return JSON.parse(html.slice(inicio, finAsignacion).trim()) as EstadoElCorteIngles;
  } catch {
    return null;
  }
}

function convertirProductoEstructurado(
  producto: ProductoEstadoElCorteIngles,
  consulta: string,
): ProductoElCorteIngles | null {
  const ruta = producto._uri?.trim();
  if (!ruta?.startsWith("/supermercado/")) return null;

  const variante = producto._my_colors
    ?.flatMap((color) => color.variants ?? [])
    .find((item) => numeroPositivo(String(item.sale_price ?? item.price)) !== null);
  const precioLista = numeroPositivo(String(variante?.price));
  const precioVenta = numeroPositivo(
    String(variante?.sale_price ?? variante?.price),
  );
  const identificador =
    producto.product_original_id?.trim() ||
    producto.id?.trim() ||
    identificadorDesdeUrl(ruta);
  const nombre = (producto.title ?? producto.description)?.trim();
  if (!identificador || !nombre || precioVenta === null) return null;

  const rebajado = precioLista !== null && precioLista > precioVenta;
  const textoReferencia = variante?.pumOrPackComposition ?? "";
  const precioReferenciaDeclarado = numeroPositivo(textoReferencia);
  const unidadReferenciaDeclarada = unidadReferencia(textoReferencia);
  const pesoVariableKg = pesoPiezaVariableKg(
    nombre,
    precioReferenciaDeclarado !== null || unidadReferenciaDeclarada !== null,
  );
  const factorPrecioEnvase = pesoVariableKg ?? 1;
  const imagen =
    producto.priority_image?.default_source ??
    producto.priority_image?.sources?.medium ??
    producto.image?.default_source ??
    producto.image?.sources?.medium ??
    producto._my_colors?.[0]?.image;
  const descuento =
    typeof variante?.discount === "number" && variante.discount > 0
      ? variante.discount
      : rebajado && precioLista
        ? Math.round((1 - precioVenta / precioLista) * 100)
        : 0;

  return {
    identificadorExterno: identificador,
    ean: variante?.gtin?.trim() || producto._single_sku?.gtin?.trim() || null,
    nombreOriginal: nombre.replace(/\s+/g, " "),
    marcaOriginal: producto.brand?.name?.trim() || null,
    categoriaOriginal: null,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: redondearPrecio(
      (rebajado ? precioLista : precioVenta) * factorPrecioEnvase,
    ),
    precioPromocional: rebajado
      ? redondearPrecio(precioVenta * factorPrecioEnvase)
      : null,
    precioReferencia: pesoVariableKg ? precioVenta : precioReferenciaDeclarado,
    unidadReferencia: pesoVariableKg ? "KG" : unidadReferenciaDeclarada,
    textoPromocion: rebajado
      ? descuento > 0
        ? `${descuento}% de descuento`
        : "Oferta El Corte Inglés"
      : null,
    fechaInicioPromocion: null,
    fechaFinPromocion: null,
    disponible:
      variante?.add_to_cart === "ADD" ||
      (!variante?.add_to_cart && producto._status === "ADD"),
    urlProducto: new URL(ruta, ORIGEN_EL_CORTE_INGLES).toString(),
    urlImagen: imagen
      ? new URL(imagen, ORIGEN_EL_CORTE_INGLES).toString()
      : null,
  };
}

function parsearBloquesEstructurados(
  estado: EstadoElCorteIngles | null,
  consulta: string,
  limite: number,
): { total: number; productos: ProductoElCorteIngles[] } | null {
  if (!estado?.blocks) return null;

  const productos = new Map<string, ProductoElCorteIngles>();
  let total = 0;
  for (const bloque of estado.blocks) {
    const productosSupermercado = (bloque.products ?? []).filter((producto) =>
      producto._uri?.startsWith("/supermercado/"),
    );
    if (productosSupermercado.length > 0) {
      total = Math.max(
        total,
        bloque._datalayer?.[0]?.page?.total_products ??
          productosSupermercado.length,
      );
    }
    for (const productoApi of productosSupermercado) {
      const producto = convertirProductoEstructurado(productoApi, consulta);
      if (producto) productos.set(producto.identificadorExterno, producto);
      if (productos.size >= limite) break;
    }
    if (productos.size >= limite) break;
  }

  return productos.size > 0
    ? { total: Math.max(total, productos.size), productos: [...productos.values()] }
    : null;
}

function primerTexto(
  elemento: cheerio.Cheerio<AnyNode>,
  selectores: string[],
): string {
  for (const selector of selectores) {
    const texto = elemento.find(selector).first().text().replace(/\s+/g, " ").trim();
    if (texto) return texto;
  }
  return "";
}

function primerAtributo(
  elemento: cheerio.Cheerio<AnyNode>,
  selectores: string[],
  atributo: string,
): string | undefined {
  for (const selector of selectores) {
    const valor = elemento.find(selector).first().attr(atributo)?.trim();
    if (valor) return valor;
  }
  return undefined;
}

function precioPrincipal(elemento: cheerio.Cheerio<AnyNode>) {
  const selectoresActual = [
    ".price-current",
    ".price_current",
    ".product_preview-price",
    ".product-price",
    "[data-price]",
    ".js-product-price",
  ];
  for (const selector of selectoresActual) {
    const precio = numeroPositivo(
      elemento.find(selector).first().attr("data-price") ??
        elemento.find(selector).first().text(),
    );
    if (precio !== null) return precio;
  }

  const bloque = elemento.find(".js-preview-pricing").first().clone();
  bloque.find("del, .price-old, .price-before, .price-unit, .unit-price").remove();
  return numeroPositivo(bloque.text());
}

function precioAnterior(elemento: cheerio.Cheerio<AnyNode>) {
  return numeroPositivo(
    primerTexto(elemento, [
      "del",
      ".price-old",
      ".price-before",
      ".price_original",
      ".previous-price",
    ]),
  );
}

function tarjetaProducto(
  enlace: cheerio.Cheerio<AnyNode>,
  $: cheerio.CheerioAPI,
): cheerio.Cheerio<AnyNode> {
  const candidatos = enlace.parents(
    "article, li, .product_preview, .product, [data-product-id]",
  );
  for (const candidato of candidatos.toArray()) {
    const tarjeta = $(candidato);
    if (tarjeta.find('a[href*="/supermercado/"]').length <= 2) return tarjeta;
  }
  return enlace.parent();
}

export function parsearResultadosElCorteIngles(
  html: string,
  consulta: string,
  limite: number,
): { total: number; productos: ProductoElCorteIngles[] } {
  const resultadoEstructurado = parsearBloquesEstructurados(
    extraerEstado(html),
    consulta,
    limite,
  );
  if (resultadoEstructurado) return resultadoEstructurado;

  const $ = cheerio.load(html);
  const productos = new Map<string, ProductoElCorteIngles>();
  const categoria =
    $(".breadcrumb li, .breadcrumbs li").last().text().replace(/\s+/g, " ").trim() ||
    null;

  $('a[href*="/supermercado/"]').each((_, nodo) => {
    if (productos.size >= limite) return false;
    const enlace = $(nodo);
    const href = enlace.attr("href")?.trim();
    const identificador = href ? identificadorDesdeUrl(href) : null;
    if (!href || !identificador || productos.has(identificador)) return;

    const tarjeta = tarjetaProducto(enlace, $);
    const nombre = (
      primerTexto(tarjeta, [
        ".product_preview-desc",
        ".product-name",
        ".product-title",
        "h2",
        "h3",
      ]) ||
      enlace.attr("title") ||
      primerAtributo(tarjeta, ["img"], "alt") ||
      ""
    ).trim();
    const precioActual = precioPrincipal(tarjeta);
    if (!nombre || precioActual === null) return;

    const precioLista = precioAnterior(tarjeta);
    const rebajado = precioLista !== null && precioLista > precioActual;
    const textoReferencia = primerTexto(tarjeta, [
      ".price-unit",
      ".unit-price",
      ".product_preview-unit",
      ".product-unit-price",
    ]);
    const promocion =
      primerTexto(tarjeta, [
        ".product_preview-offer",
        ".product-offer",
        ".offer",
        ".promotion",
        "[class*='promo']",
      ]) || null;
    const precioReferenciaDeclarado = numeroPositivo(textoReferencia);
    const unidadReferenciaDeclarada = unidadReferencia(textoReferencia);
    const pesoVariableKg = pesoPiezaVariableKg(
      nombre,
      precioReferenciaDeclarado !== null || unidadReferenciaDeclarada !== null,
    );
    const factorPrecioEnvase = pesoVariableKg ?? 1;
    const imagen =
      primerAtributo(tarjeta, ["img"], "src") ??
      primerAtributo(tarjeta, ["img"], "data-src") ??
      primerAtributo(tarjeta, ["source"], "srcset");

    productos.set(identificador, {
      identificadorExterno: identificador,
      ean: null,
      nombreOriginal: nombre.replace(/\s+/g, " "),
      marcaOriginal:
        primerTexto(tarjeta, [".product_preview-brand", ".product-brand"]) || null,
      categoriaOriginal: categoria,
      categoriaSugerida: obtenerCategoriaSugerida(consulta),
      precio: redondearPrecio(
        (rebajado ? precioLista : precioActual) * factorPrecioEnvase,
      ),
      precioPromocional: rebajado
        ? redondearPrecio(precioActual * factorPrecioEnvase)
        : null,
      precioReferencia: pesoVariableKg
        ? precioActual
        : precioReferenciaDeclarado,
      unidadReferencia: pesoVariableKg ? "KG" : unidadReferenciaDeclarada,
      textoPromocion: promocion ?? (rebajado ? "Oferta El Corte Inglés" : null),
      fechaInicioPromocion: null,
      fechaFinPromocion: null,
      disponible: !/agotado|no disponible/i.test(tarjeta.text()),
      urlProducto: new URL(href, ORIGEN_EL_CORTE_INGLES).toString(),
      urlImagen: imagen
        ? new URL(imagen.split(/\s+/)[0], ORIGEN_EL_CORTE_INGLES).toString()
        : null,
    });
  });

  const totalTexto = $("h1").parent().text() + " " + $("[class*='total']").first().text();
  const total = Number(totalTexto.match(/\(\s*(\d+)\s*\)/)?.[1]);
  return {
    total: Number.isFinite(total) ? total : productos.size,
    productos: [...productos.values()].slice(0, limite),
  };
}

export async function rastrearProductosElCorteIngles({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoElCorteIngles[];
  peticionesRealizadas: number;
  centroEntrega: string;
}> {
  return ejecutarConReintentos(
    async (intento) => {
      // La página HTML de resultados bloquea con frecuencia las IP de centros de
      // datos. Su API oficial de VueStore devuelve el mismo estado estructurado.
      const url = new URL(
        "/api/firefly/vuestore/new-search/1/",
        ORIGEN_EL_CORTE_INGLES,
      );
      url.searchParams.set("s", consulta);
      url.searchParams.set("showDimensions", "none");
      url.searchParams.set("stype", "past_search_multi");
      url.searchParams.set("isHome", "false");
      url.searchParams.set("isBookSearch", "false");
      if (intento > 1) url.searchParams.set("_intento", String(intento));

      const respuesta = await fetchComoNavegador(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "es-ES,es;q=0.9",
          Cookie: `home_delivery_center=${CENTRO_ENTREGA_REFERENCIA}`,
          Referer: `${ORIGEN_EL_CORTE_INGLES}/supermercado/`,
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
      });
      if (!respuesta.ok) {
        throw new Error(
          `El Corte Inglés respondió con estado ${respuesta.status}`,
        );
      }

      const estado = (await respuesta.json()) as EstadoElCorteIngles;
      const resultado = parsearBloquesEstructurados(
        estado,
        consulta,
        Math.min(Math.max(1, limite), MAX_RESULTADOS_POR_PETICION),
      );
      if (!resultado || resultado.productos.length === 0) {
        throw new Error(
          "La API de El Corte Inglés no devolvió productos de supermercado",
        );
      }
      return {
        ...resultado,
        peticionesRealizadas: 1,
        centroEntrega: CENTRO_ENTREGA_REFERENCIA,
      };
    },
    { intentos: 3, retrasoInicialMs: 2_000 },
  );
}
