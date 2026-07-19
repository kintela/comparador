import "server-only";

import * as cheerio from "cheerio";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";
import { normalizarTerminoRastreo } from "@/servicios/rastreo/terminos";

import type { ProductoPrimaprix } from "./tipos-primaprix";

const ORIGEN_PRIMAPRIX = "https://primaprix.eu";
const URL_CATALOGO = `${ORIGEN_PRIMAPRIX}/es/catalogo/`;
const PERFILES = [
  "home-lover",
  "cazaofertas",
  "a-comer",
  "bio-power",
  "belleza",
] as const;
const USER_AGENT =
  "Mozilla/5.0 (compatible; ComparadorPrecios/1.0; +https://primaprix.eu)";

type ProductoCatalogo = Omit<ProductoPrimaprix, "categoriaSugerida"> & {
  textoBusqueda: string;
};

function extraerPrecio(texto: string): number | null {
  const valor = Number(
    texto
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

function slugProducto(url: string): string | null {
  try {
    const partes = new URL(url, ORIGEN_PRIMAPRIX).pathname
      .split("/")
      .filter(Boolean);
    const indice = partes.indexOf("producto");
    return indice >= 0 ? partes[indice + 1] ?? null : null;
  } catch {
    return null;
  }
}

function parsearCatalogo(html: string, perfil: string): ProductoCatalogo[] {
  const $ = cheerio.load(html);
  const productos: ProductoCatalogo[] = [];

  $(".product-list__item").each((_, elemento) => {
    const item = $(elemento);
    const enlace = item.find("a.product").first();
    const urlProducto = enlace.attr("href")?.trim();
    const identificadorExterno = urlProducto
      ? slugProducto(urlProducto)
      : null;
    const nombre = (
      item.attr("data-name") ??
      item.find(".product__title").first().text()
    ).trim();
    const marca = (
      item.attr("data-brand") ??
      item.find(".product__brand").first().text()
    ).trim();
    const precio = extraerPrecio(
      item.find(".product__only-price").first().text(),
    );
    const urlImagen = item.find(".product__image img").first().attr("src")?.trim();

    if (!identificadorExterno || !urlProducto || !nombre || precio === null) {
      return;
    }

    productos.push({
      identificadorExterno,
      ean: null,
      nombreOriginal: nombre,
      marcaOriginal: marca || null,
      categoriaOriginal: perfil,
      precio,
      precioPromocional: null,
      precioReferencia: null,
      unidadReferencia: null,
      textoPromocion: null,
      fechaInicioPromocion: null,
      fechaFinPromocion: null,
      disponible: true,
      urlProducto: new URL(urlProducto, ORIGEN_PRIMAPRIX).toString(),
      urlImagen: urlImagen
        ? new URL(urlImagen, ORIGEN_PRIMAPRIX).toString()
        : null,
      textoBusqueda: normalizarTerminoRastreo(`${marca} ${nombre}`),
    });
  });

  return productos;
}

async function descargarPerfil(perfil: string): Promise<ProductoCatalogo[]> {
  const url = new URL(URL_CATALOGO);
  url.searchParams.set("perfil", perfil);
  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new Error(
      `Primaprix respondió con estado ${respuesta.status} para ${perfil}`,
    );
  }
  return parsearCatalogo(await respuesta.text(), perfil);
}

export async function cargarCatalogoPrimaprix(): Promise<{
  productos: ProductoCatalogo[];
  peticionesRealizadas: number;
}> {
  const resultados = await Promise.all(PERFILES.map(descargarPerfil));
  const productos = new Map<string, ProductoCatalogo>();

  for (const producto of resultados.flat()) {
    const existente = productos.get(producto.identificadorExterno);
    if (!existente) {
      productos.set(producto.identificadorExterno, producto);
      continue;
    }
    const categorias = new Set(
      `${existente.categoriaOriginal ?? ""},${producto.categoriaOriginal ?? ""}`
        .split(",")
        .filter(Boolean),
    );
    existente.categoriaOriginal = [...categorias].join(", ");
  }

  return {
    productos: [...productos.values()],
    peticionesRealizadas: PERFILES.length,
  };
}

export function buscarEnCatalogoPrimaprix({
  catalogo,
  consulta,
  limite,
}: {
  catalogo: ProductoCatalogo[];
  consulta: string;
  limite: number;
}): ProductoPrimaprix[] {
  const normalizada = normalizarTerminoRastreo(consulta);
  const tokens = normalizada.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  return catalogo
    .filter((producto) =>
      tokens.every((token) => producto.textoBusqueda.includes(token)),
    )
    .slice(0, limite)
    .map((producto) => {
      const { textoBusqueda, ...productoPublico } = producto;
      void textoBusqueda;
      return {
        ...productoPublico,
        categoriaSugerida: obtenerCategoriaSugerida(consulta),
      };
    });
}
