import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  CategoriaMercadona,
  ProductoApiMercadona,
  ProductoMercadona,
  RespuestaCategoriasMercadona,
  ZonaMercadona,
} from "./tipos-mercadona";

const API_MERCADONA = "https://tienda.mercadona.es/api";
const MARCAS_PROPIAS = [
  "Hacendado",
  "Bosque Verde",
  "Deliplus",
  "Compy",
  "Baby Smile",
];

function cabeceras() {
  return {
    Accept: "application/json",
    "Accept-Language": "es-ES,es;q=0.9",
    "Content-Type": "application/json",
    "User-Agent": "ComparadorPrecios/0.1 (rastreador de precios)",
  };
}

function numero(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const convertido = Number(valor.replace(",", "."));
  return Number.isFinite(convertido) ? convertido : null;
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function obtenerMarca(nombre: string): string | null {
  const normalizado = normalizar(nombre);
  return (
    MARCAS_PROPIAS.find((marca) => normalizado.includes(normalizar(marca))) ?? null
  );
}

function nombreConCantidad(producto: ProductoApiMercadona) {
  const instrucciones = producto.price_instructions;
  const cantidad = instrucciones?.unit_size;
  const unidad = instrucciones?.size_format?.trim();
  if (!cantidad || !unidad) return producto.display_name.trim();

  const cantidadTexto = cantidad.toLocaleString("es-ES", {
    maximumFractionDigits: 3,
  });
  const nombre = producto.display_name.trim();
  const patron = new RegExp(
    `\\b${cantidad.toString().replace(".", "[.,]")}\\s*${unidad}\\b`,
    "i",
  );
  return patron.test(nombre) ? nombre : `${nombre}, ${cantidadTexto} ${unidad}`;
}

function convertirProducto(
  producto: ProductoApiMercadona,
  consulta: string,
): ProductoMercadona | null {
  const precioActual = numero(producto.price_instructions?.unit_price);
  if (!producto.id || !producto.display_name || precioActual === null) return null;

  const precioAnterior = numero(producto.price_instructions?.previous_unit_price);
  const rebajado =
    producto.price_instructions?.price_decreased === true &&
    precioAnterior !== null &&
    precioAnterior > precioActual;

  return {
    identificadorExterno: producto.id,
    ean: null,
    nombreOriginal: nombreConCantidad(producto),
    marcaOriginal: obtenerMarca(producto.display_name),
    categoriaOriginal: producto.categories?.[0]?.name?.trim() ?? null,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: rebajado ? precioAnterior : precioActual,
    precioPromocional: rebajado ? precioActual : null,
    precioReferencia: numero(
      producto.price_instructions?.reference_price ??
        producto.price_instructions?.bulk_price,
    ),
    unidadReferencia: producto.price_instructions?.reference_format?.trim() ?? null,
    textoPromocion: rebajado ? "Precio reducido" : null,
    fechaInicioPromocion: null,
    fechaFinPromocion: null,
    disponible:
      producto.published !== false &&
      !["temporarily_unavailable", "unavailable_in_warehouse"].includes(
        producto.status ?? "",
      ),
    urlProducto:
      producto.share_url ??
      `https://tienda.mercadona.es/product/${producto.id}`,
    urlImagen: producto.thumbnail ?? null,
  };
}

async function obtenerJson<T>(url: URL): Promise<T> {
  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: cabeceras(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Mercadona respondió con estado ${respuesta.status}`);
  }
  return (await respuesta.json()) as T;
}

export async function resolverZonaMercadona(
  codigoPostal: string,
): Promise<ZonaMercadona> {
  const url = new URL(`${API_MERCADONA}/postal-codes/actions/change-pc/`);
  const respuesta = await fetch(url, {
    method: "PUT",
    cache: "no-store",
    headers: cabeceras(),
    body: JSON.stringify({ new_postal_code: codigoPostal }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuesta.ok) {
    throw new Error(
      `Mercadona no pudo validar el código postal (${respuesta.status})`,
    );
  }

  const almacen = respuesta.headers.get("x-customer-wh");
  const codigoPostalConfirmado = respuesta.headers.get("x-customer-pc");
  if (!almacen || !codigoPostalConfirmado) {
    throw new Error("Mercadona no devolvió el almacén asociado al código postal");
  }
  return { codigoPostal: codigoPostalConfirmado, almacen };
}

export async function obtenerIndiceCategoriasMercadona(
  almacen: string,
): Promise<CategoriaMercadona[]> {
  const url = new URL(`${API_MERCADONA}/categories/`);
  url.searchParams.set("wh", almacen);
  const datos = await obtenerJson<RespuestaCategoriasMercadona>(url);
  return datos.results ?? [];
}

function extraerProductos(categoria: CategoriaMercadona): ProductoApiMercadona[] {
  return [
    ...(categoria.products ?? []),
    ...(categoria.categories ?? []).flatMap(extraerProductos),
  ];
}

export async function rastrearCategoriaMercadona({
  categoriaId,
  almacen,
  consulta,
}: {
  categoriaId: number;
  almacen: string;
  consulta: string;
}): Promise<ProductoMercadona[]> {
  const url = new URL(`${API_MERCADONA}/categories/${categoriaId}/`);
  url.searchParams.set("wh", almacen);
  const categoria = await obtenerJson<CategoriaMercadona>(url);
  return extraerProductos(categoria)
    .map((producto) => convertirProducto(producto, consulta))
    .filter((producto): producto is ProductoMercadona => producto !== null);
}
