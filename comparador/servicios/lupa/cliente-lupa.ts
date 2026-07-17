import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type {
  ProductoApiLupa,
  ProductoLupa,
  RespuestaMarcasLupa,
  RespuestaProductosLupa,
} from "./tipos-lupa";

const ORIGEN_LUPA = "https://www.lupaonline.com";
const TIENDA_LUPA = "santander";
const ENDPOINT_GRAPHQL = `${ORIGEN_LUPA}/graphql`;
const RESULTADOS_POR_PAGINA = 50;
const MAX_PAGINAS_POR_BUSQUEDA = 1;

const CAMPOS_PRODUCTO = `
  total_count
  page_info { total_pages current_page }
  items {
    uid sku name url_key stock_status marca special_to_date
    small_image { url }
    categories { name }
    price_range {
      minimum_price {
        regular_price { value currency }
        final_price { value currency }
        discount { amount_off percent_off }
      }
    }
  }
`;

const CONSULTA_MARCAS = `{
  customAttributeMetadata(
    attributes: [{ attribute_code: "marca", entity_type: "catalog_product" }]
  ) {
    items { attribute_options { value label } }
  }
}`;

let promesaMarcas: Promise<Map<string, string>> | null = null;

function cabecerasLupa() {
  return {
    Accept: "application/json",
    "Accept-Language": "es-ES,es;q=0.9",
    Referer: `${ORIGEN_LUPA}/${TIENDA_LUPA}/`,
    Store: TIENDA_LUPA,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
}

async function consultarGraphql<T>(consulta: string): Promise<T> {
  const url = new URL(ENDPOINT_GRAPHQL);
  url.searchParams.set("query", consulta);
  const respuesta = await fetch(url, {
    cache: "no-store",
    headers: cabecerasLupa(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Lupa respondió con estado ${respuesta.status}`);
  }
  return (await respuesta.json()) as T;
}

async function obtenerMarcas() {
  if (!promesaMarcas) {
    promesaMarcas = consultarGraphql<RespuestaMarcasLupa>(CONSULTA_MARCAS)
      .then((respuesta) => {
        if (respuesta.errors?.length) {
          throw new Error(
            respuesta.errors[0].message ?? "Lupa no devolvió sus marcas",
          );
        }
        const opciones =
          respuesta.data?.customAttributeMetadata?.items?.[0]
            ?.attribute_options ?? [];
        return new Map(
          opciones.flatMap((opcion) =>
            opcion.value && opcion.label && !/^[-.]$/.test(opcion.label.trim())
              ? [[opcion.value, opcion.label.trim()] as const]
              : [],
          ),
        );
      })
      .catch((error) => {
        promesaMarcas = null;
        throw error;
      });
  }
  return promesaMarcas;
}

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

function productoRelevante(producto: ProductoApiLupa, consulta: string) {
  const palabras = normalizar(consulta)
    .split(" ")
    .filter((palabra) => palabra.length > 1)
    .map(raizPalabra);
  const tokens = normalizar(
    [producto.name, ...(producto.categories ?? []).map((item) => item.name)]
      .filter(Boolean)
      .join(" "),
  )
    .split(" ")
    .map(raizPalabra);
  return palabras.every((palabra) => tokens.includes(palabra));
}

function referenciaDesdeNombre(nombre: string, precio: number) {
  const texto = normalizar(nombre).replace(/(\d),(\d)/g, "$1.$2");
  const pack = texto.match(
    /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(ml|cl|l|litro|litros|kg|g|gr|grs)\b/,
  );
  const cantidad = texto.match(
    /(\d+(?:\.\d+)?)\s*(ml|cl|l|litro|litros|kg|g|gr|grs)\b/,
  );
  const coincidencia = pack ?? cantidad;
  if (!coincidencia) return { precio: null, unidad: null };

  const unidades = pack ? Number(pack[1]) : 1;
  const valor = Number(pack ? pack[2] : coincidencia[1]);
  const unidad = pack ? pack[3] : coincidencia[2];
  if (!Number.isFinite(valor) || valor <= 0) return { precio: null, unidad: null };

  const volumen =
    unidad === "l" || unidad.startsWith("litro")
      ? valor
      : unidad === "cl"
        ? valor / 100
        : unidad === "ml"
          ? valor / 1000
          : null;
  const peso =
    unidad === "kg" ? valor : ["g", "gr", "grs"].includes(unidad) ? valor / 1000 : null;
  const cantidadBase = (volumen ?? peso) ?? 0;
  if (cantidadBase <= 0) return { precio: null, unidad: null };

  return {
    precio: Number((precio / (unidades * cantidadBase)).toFixed(2)),
    unidad: volumen !== null ? "L" : "KG",
  };
}

function convertirProducto(
  producto: ProductoApiLupa,
  consulta: string,
  marcas: Map<string, string>,
): ProductoLupa | null {
  const identificador = producto.sku;
  const nombre = producto.name?.trim();
  const precios = producto.price_range?.minimum_price;
  const precioNormal = precios?.regular_price?.value;
  const precioActual = precios?.final_price?.value;
  if (
    !identificador ||
    !nombre ||
    typeof precioNormal !== "number" ||
    typeof precioActual !== "number" ||
    precioNormal <= 0 ||
    precioActual <= 0
  ) {
    return null;
  }

  const rebajado = precioNormal > precioActual;
  const porcentaje = precios?.discount?.percent_off;
  const referencia = referenciaDesdeNombre(nombre, precioActual);
  const categoria =
    producto.categories
      ?.map((item) => item.name?.trim())
      .filter((item): item is string => Boolean(item))
      .at(-1) ?? null;

  return {
    identificadorExterno: identificador,
    ean: null,
    nombreOriginal: nombre,
    marcaOriginal:
      producto.marca !== null && producto.marca !== undefined
        ? (marcas.get(String(producto.marca)) ?? null)
        : null,
    categoriaOriginal: categoria,
    categoriaSugerida: obtenerCategoriaSugerida(consulta),
    precio: precioNormal,
    precioPromocional: rebajado ? precioActual : null,
    precioReferencia: referencia.precio,
    unidadReferencia: referencia.unidad,
    textoPromocion:
      rebajado && typeof porcentaje === "number"
        ? `${Math.round(porcentaje)}% de descuento`
        : rebajado
          ? "Oferta"
          : null,
    fechaInicioPromocion: null,
    fechaFinPromocion: rebajado ? (producto.special_to_date ?? null) : null,
    disponible: producto.stock_status === "IN_STOCK",
    urlProducto: producto.url_key
      ? `${ORIGEN_LUPA}/${TIENDA_LUPA}/${producto.url_key}`
      : `${ORIGEN_LUPA}/${TIENDA_LUPA}/catalogsearch/result/?q=${encodeURIComponent(consulta)}`,
    urlImagen: producto.small_image?.url ?? null,
  };
}

async function obtenerPagina(consulta: string, pagina: number) {
  const termino = JSON.stringify(consulta);
  const consultaGraphql = `{
    products(
      search: ${termino}
      pageSize: ${RESULTADOS_POR_PAGINA}
      currentPage: ${pagina}
    ) { ${CAMPOS_PRODUCTO} }
  }`;
  const [respuesta, marcas] = await Promise.all([
    consultarGraphql<RespuestaProductosLupa>(consultaGraphql),
    obtenerMarcas(),
  ]);
  if (respuesta.errors?.length) {
    throw new Error(
      respuesta.errors[0].message ?? "Lupa no devolvió resultados válidos",
    );
  }
  const datos = respuesta.data?.products;
  if (!Array.isArray(datos?.items)) {
    throw new Error("Lupa no devolvió resultados de búsqueda válidos");
  }
  return { datos, marcas };
}

export async function rastrearProductosLupa({
  consulta,
  limite,
}: {
  consulta: string;
  limite: number;
}): Promise<{
  total: number;
  productos: ProductoLupa[];
  peticionesRealizadas: number;
}> {
  const productos = new Map<string, ProductoLupa>();
  let total = 0;
  let peticionesRealizadas = 0;

  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_BUSQUEDA; pagina += 1) {
    const { datos, marcas } = await obtenerPagina(consulta, pagina);
    peticionesRealizadas += 1;
    total = datos.total_count ?? total;
    for (const productoApi of datos.items ?? []) {
      if (!productoRelevante(productoApi, consulta)) continue;
      const producto = convertirProducto(productoApi, consulta, marcas);
      if (producto) productos.set(producto.identificadorExterno, producto);
      if (productos.size >= limite) break;
    }
    if (
      productos.size >= limite ||
      pagina >= (datos.page_info?.total_pages ?? 1)
    ) break;
  }

  return {
    total,
    productos: [...productos.values()].slice(0, limite),
    peticionesRealizadas,
  };
}
