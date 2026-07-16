import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import type {
  ItemMetricasEroski,
  MetricasProductoEroski,
  ProductoEroski,
} from "./tipos-eroski";

const ORIGEN_EROSKI = "https://supermercado.eroski.es";

function normalizarUrl(valor: string | undefined): string | null {
  if (!valor) return null;

  try {
    const url = new URL(valor, ORIGEN_EROSKI);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return null;
  }
}

function leerMetricas(
  bloque: Cheerio<AnyNode>,
): ItemMetricasEroski | null {
  const valor = bloque.find(".product-title-link[data-metrics]").attr("data-metrics");
  if (!valor) return null;

  try {
    const metricas = JSON.parse(valor) as MetricasProductoEroski;
    return metricas.ecommerce?.items?.[0] ?? null;
  } catch {
    return null;
  }
}

function convertirPrecio(valor: string | number | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (!valor) return null;

  const normalizado = valor
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const precio = Number.parseFloat(normalizado);

  return Number.isFinite(precio) ? precio : null;
}

function extraerIdentificador(url: string | null): string | null {
  return url?.match(/\/productdetail\/(\d+)(?:-|\/|$)/)?.[1] ?? null;
}

function parsearProducto(bloque: Cheerio<AnyNode>): ProductoEroski | null {
  const metricas = leerMetricas(bloque);
  const imagen = bloque.find("img.product-img").first();
  const enlace = bloque.find("a.product-title-link").first();
  const urlProducto = normalizarUrl(enlace.attr("href") ?? imagen.parent("a").attr("href"));
  const identificadorExterno =
    metricas?.item_id?.toString() ?? extraerIdentificador(urlProducto);
  const nombreOriginal =
    metricas?.item_name?.trim() ||
    imagen.attr("alt")?.trim() ||
    enlace.text().trim();
  const precio = convertirPrecio(
    metricas?.price ?? bloque.find(".price-offer-now").first().text(),
  );

  if (!identificadorExterno || !nombreOriginal || precio === null || !urlProducto) {
    return null;
  }

  return {
    identificadorExterno,
    nombreOriginal,
    precio,
    moneda: "EUR",
    urlProducto,
    urlImagen: normalizarUrl(imagen.attr("src")),
    disponible: bloque.find("a.toAddProduct").length > 0,
    marcaOriginal: metricas?.item_brand?.trim() || null,
  };
}

export function parsearResultadosEroski(html: string): {
  totalDeclarado: number | null;
  productos: ProductoEroski[];
} {
  const $ = load(html);
  const textoCabecera = $(".product-lineal-title").first().text();
  const totalCapturado = textoCabecera.match(/\(([\d.]+)\)/)?.[1];
  const totalDeclarado = totalCapturado
    ? Number.parseInt(totalCapturado.replaceAll(".", ""), 10)
    : null;
  const productos = new Map<string, ProductoEroski>();

  $(".product-item-lineal.item-type-1").each((_, elemento) => {
    const producto = parsearProducto($(elemento));
    if (producto) productos.set(producto.identificadorExterno, producto);
  });

  return {
    totalDeclarado,
    productos: [...productos.values()],
  };
}
