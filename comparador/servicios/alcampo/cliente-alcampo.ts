import "server-only";

import { crearSlug, obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  EstadoInicialAlcampo,
  ProductoAlcampo,
  ProductoApiAlcampo,
} from "./tipos-alcampo";

const ORIGEN_ALCAMPO = "https://www.compraonline.alcampo.es";
const MARCADOR_ESTADO = "window.__INITIAL_STATE__=";

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

function productoRelevante(producto: ProductoApiAlcampo, consulta: string) {
  const palabras = normalizar(consulta)
    .split(" ")
    .filter((palabra) => palabra.length > 1)
    .map(raizPalabra);
  const tokens = normalizar(
    [producto.name, producto.brand, ...(producto.categoryPath ?? [])]
      .filter(Boolean)
      .join(" "),
  )
    .split(" ")
    .map(raizPalabra);

  return palabras.every((palabra) => tokens.includes(palabra));
}

function numeroPositivo(valor: string | undefined) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function unidadReferencia(etiqueta: string | undefined) {
  if (!etiqueta) return null;
  if (etiqueta.endsWith(".litre")) return "L";
  if (etiqueta.endsWith(".kilogram")) return "KG";
  if (etiqueta.endsWith(".unit")) return "UD";
  return etiqueta.replace("fop.price.per.", "").toLocaleUpperCase("es");
}

function extraerFechasOferta(descripcion: string | undefined) {
  const coincidencia = descripcion?.match(
    /\((\d{2})\/(\d{2})\/(\d{2})_(\d{2})\/(\d{2})\/(\d{2})\)/,
  );
  if (!coincidencia) return { inicio: null, fin: null };
  const [, diaInicio, mesInicio, anoInicio, diaFin, mesFin, anoFin] = coincidencia;
  return {
    inicio: `20${anoInicio}-${mesInicio}-${diaInicio}`,
    fin: `20${anoFin}-${mesFin}-${diaFin}`,
  };
}

function urlProducto(nombre: string, identificador: string) {
  const slug = crearSlug(nombre);
  return `${ORIGEN_ALCAMPO}/products/${slug}/${identificador}`;
}

function convertirProducto(
  producto: ProductoApiAlcampo,
  consulta: string,
): ProductoAlcampo | null {
  const identificador = producto.retailerProductId;
  const nombre = producto.name?.trim();
  const precioActual = numeroPositivo(producto.price?.current?.amount);
  if (!identificador || !nombre || precioActual === null) return null;

  const precioAnterior =
    numeroPositivo(producto.price?.previous?.amount) ??
    numeroPositivo(producto.price?.original?.amount);
  const rebajado = precioAnterior !== null && precioAnterior > precioActual;
  const oferta = producto.offer ?? producto.offers?.[0];
  const fechas = extraerFechasOferta(oferta?.description);

  return {
    identificadorExterno: identificador,
    ean: null,
    nombreOriginal: nombre,
    marcaOriginal: producto.brand?.trim() || null,
    categoriaOriginal: producto.categoryPath?.at(-1)?.trim() || null,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: rebajado ? precioAnterior : precioActual,
    precioPromocional: rebajado ? precioActual : null,
    precioReferencia: numeroPositivo(producto.price?.unit?.current?.amount),
    unidadReferencia: unidadReferencia(producto.price?.unit?.label),
    textoPromocion: oferta?.description?.trim() || null,
    fechaInicioPromocion: fechas.inicio,
    fechaFinPromocion: fechas.fin,
    disponible:
      producto.available !== false && producto.isInCurrentCatalog !== false,
    urlProducto: urlProducto(nombre, identificador),
    urlImagen: producto.image?.src ?? null,
  };
}

function extraerEstadoInicial(html: string): EstadoInicialAlcampo {
  const inicioMarcador = html.indexOf(MARCADOR_ESTADO);
  if (inicioMarcador < 0) {
    throw new Error("Alcampo no incluyó el catálogo estructurado en la respuesta");
  }
  const inicio = inicioMarcador + MARCADOR_ESTADO.length;
  const fin = html.indexOf("</script>", inicio);
  if (fin < 0) throw new Error("El catálogo estructurado de Alcampo está incompleto");

  const json = html.slice(inicio, fin).trim().replace(/;$/, "");
  try {
    return JSON.parse(json) as EstadoInicialAlcampo;
  } catch {
    throw new Error("No se pudo interpretar el catálogo estructurado de Alcampo");
  }
}

export async function rastrearProductosAlcampo({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoAlcampo[];
  peticionesRealizadas: number;
  regionId: string | null;
}> {
  const url = new URL("/search", ORIGEN_ALCAMPO);
  url.searchParams.set("q", consulta);
  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Alcampo respondió con estado ${respuesta.status}`);
  }

  const estado = extraerEstadoInicial(await respuesta.text());
  const catalogo = estado.data?.search?.catalogue?.data;
  const entidades = estado.data?.products?.productEntities ?? {};
  const idsOrdenados = (catalogo?.productGroups ?? []).flatMap(
    (grupo) => grupo.products ?? [],
  );
  const productos = new Map<string, ProductoAlcampo>();

  for (const id of idsOrdenados) {
    const productoApi = entidades[id];
    if (!productoApi || !productoRelevante(productoApi, consulta)) continue;
    const producto = convertirProducto(productoApi, consulta);
    if (producto) productos.set(producto.identificadorExterno, producto);
    if (productos.size >= limite) break;
  }

  return {
    total: catalogo?.totalProducts ?? idsOrdenados.length,
    productos: [...productos.values()].slice(0, limite),
    peticionesRealizadas: 1,
    regionId: estado.data?.basket?.regionId ?? null,
  };
}
