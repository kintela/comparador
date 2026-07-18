import "server-only";

import { createHash } from "node:crypto";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import type { CatalogoCoviran, ProductoCoviran } from "./tipos-coviran";

const ORIGEN_COVIRAN = "https://folleto.coviran.es";
const RUTA_FOLLETO = "paisvasco";
const URL_FOLLETO = `${ORIGEN_COVIRAN}/${RUTA_FOLLETO}/index.html`;
const URL_PDF =
  `${ORIGEN_COVIRAN}/${RUTA_FOLLETO}/files/assets/common/downloads/publication.pdf`;
const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const MARCAS_DESCARTADAS = new Set([
  "PECHUGA",
  "NARANJA",
  "SIN SEMILLA",
  "CABEZADA",
  "BABILLA",
]);
const PALABRAS_CATEGORIA = [
  "papel higiénico",
  "mantequilla",
  "detergente",
  "conservas",
  "galletas",
  "verduras",
  "legumbres",
  "cereales",
  "pescado",
  "champú",
  "azúcar",
  "aceite",
  "harina",
  "huevos",
  "arroz",
  "pasta",
  "leche",
  "yogur",
  "queso",
  "pollo",
  "carne",
  "fruta",
  "café",
  "agua",
  "pan",
] as const;

type ElementoTexto = {
  str: string;
  transform: number[];
};

type TokenTexto = {
  texto: string;
  x: number;
  y: number;
};

const DURACION_CACHE_CATALOGO_MS = 15 * 60 * 1000;
let cacheCatalogo: {
  creadaEn: number;
  promesa: Promise<CatalogoCoviran>;
} | null = null;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identificadorProducto(marca: string, nombre: string): string {
  return createHash("sha256")
    .update(`${normalizar(marca)}|${normalizar(nombre)}`)
    .digest("hex")
    .slice(0, 32);
}

function extraerMarca(texto: string): string | null {
  if (
    texto.length < 2 ||
    texto.length > 35 ||
    /€|\/|\d{2,}|PRECIO|PRODUCTO|GRATIS|UNIDAD|DESCUENTO|VÁLIDO|MÁXIMO|LLEVE|PAGUE|ESTRELLA/i.test(
      texto,
    )
  ) {
    return null;
  }
  const coincidencia = texto.match(
    /^([A-ZÁÉÍÓÚÜÑÇ’'&.]+(?:\s+[A-ZÁÉÍÓÚÜÑÇ’'&.]+)*)\b/u,
  );
  const marca = coincidencia?.[1].replace(/[.'’]$/, "").trim() ?? "";
  return marca.length > 1 && !MARCAS_DESCARTADAS.has(marca) ? marca : null;
}

function categoriaDesdeNombre(nombre: string): string | null {
  const tokensNombre = normalizar(nombre).split(" ");
  if (tokensNombre.includes("yatekomo")) {
    return "Pasta";
  }
  if (tokensNombre.includes("arroz") && tokensNombre.includes("leche")) {
    return "Yogures y postres";
  }
  if (
    tokensNombre.some((token) =>
      ["flakes", "cereales", "chocapic", "muesli"].includes(token),
    )
  ) {
    return "Cereales";
  }
  if (
    tokensNombre.some((token) =>
      [
        "atun",
        "bonito",
        "calamares",
        "mejillon",
        "sardinas",
        "anchoa",
      ].includes(token),
    )
  ) {
    return "Conservas";
  }
  const palabra = PALABRAS_CATEGORIA.find((item) =>
    normalizar(item)
      .split(" ")
      .every((token) => tokensNombre.includes(token)),
  );
  return palabra ? obtenerCategoriaSugerida(palabra) : null;
}

function referenciaDesdeTexto(texto: string): {
  precio: number | null;
  unidad: string | null;
} {
  const coincidencia = texto.match(
    /(\d+(?:[,.]\d+)?)\s*€\s*\/\s*(kg|l|u|100\s*ml|100\s*g)/i,
  );
  if (!coincidencia) return { precio: null, unidad: null };
  const precio = Number(coincidencia[1].replace(",", "."));
  const unidad = coincidencia[2].replace(/\s+/g, " ").toUpperCase();
  return Number.isFinite(precio) && precio > 0
    ? { precio, unidad }
    : { precio: null, unidad: null };
}

function limpiarDescripcion(texto: string): string {
  return texto
    .replace(/\s*\d+(?:[,.]\d+)?\s*€\s*\/.*$/i, "")
    .replace(/\s*1 unidad.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function urlImagenProducto(
  pagina: number,
  token: TokenTexto,
  fechaFin: string,
): string {
  const anchoPagina = 496.063;
  const anchoColumna = anchoPagina / 3;
  const columna = Math.max(
    0,
    Math.min(2, Math.floor(token.x / anchoColumna)),
  );
  const version = fechaFin.slice(0, 10);
  return (
    `/api/imagenes/coviran?pagina=${pagina}&columna=${columna}` +
    `&y=${Math.round(token.y)}&v=${version}`
  );
}

function preciosPromocion(
  texto: string,
  precioVisible: number,
): {
  precio: number;
  precioPromocional: number | null;
  detalle: string | null;
} {
  const normal = texto.match(/1 unidad\s+(\d+(?:[,.]\d+)?)\s*€/i);
  const lote = texto.match(
    /(\d+)\s+unidades\s+(\d+(?:[,.]\d+)?)\s*€/i,
  );
  if (!normal || !lote) {
    return {
      precio: precioVisible,
      precioPromocional: null,
      detalle: null,
    };
  }

  const precioNormal = Number(normal[1].replace(",", "."));
  const unidades = Number(lote[1]);
  const totalLote = Number(lote[2].replace(",", "."));
  const precioPromocional = totalLote / unidades;
  if (
    !Number.isFinite(precioNormal) ||
    !Number.isFinite(precioPromocional) ||
    precioNormal <= 0 ||
    precioPromocional <= 0 ||
    precioPromocional >= precioNormal
  ) {
    return {
      precio: precioVisible,
      precioPromocional: null,
      detalle: null,
    };
  }
  return {
    precio: precioNormal,
    precioPromocional: Number(precioPromocional.toFixed(2)),
    detalle: `${unidades} unidades por ${totalLote.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`,
  };
}

function extraerProductosPagina({
  textos,
  pagina,
  fechaInicio,
  fechaFin,
  tituloVigencia,
}: {
  textos: ElementoTexto[];
  pagina: number;
  fechaInicio: string;
  fechaFin: string;
  tituloVigencia: string;
}): ProductoCoviran[] {
  const tokens: TokenTexto[] = [];
  for (let indice = 0; indice < textos.length; indice += 1) {
    const actual = textos[indice];
    const siguiente = textos[indice + 1];
    if (
      /^\d{1,3}$/.test(actual.str) &&
      siguiente &&
      /^,\d{2}$/.test(siguiente.str)
    ) {
      tokens.push({
        texto: `${actual.str}${siguiente.str}`,
        x: actual.transform[4],
        y: actual.transform[5],
      });
      indice += 1;
    } else {
      tokens.push({
        texto: actual.str,
        x: actual.transform[4],
        y: actual.transform[5],
      });
    }
  }

  const esPrecio = (texto: string) => /^\d{1,3},\d{2}$/.test(texto);
  const productos: ProductoCoviran[] = [];
  let indiceUltimoPrecio = -99;

  for (let indice = 0; indice < tokens.length; indice += 1) {
    if (esPrecio(tokens[indice].texto)) {
      indiceUltimoPrecio = indice;
      continue;
    }

    const marca = extraerMarca(tokens[indice].texto);
    if (!marca || indice - indiceUltimoPrecio > 4) continue;

    const partes: string[] = [];
    let siguiente = indice + 1;
    for (; siguiente < tokens.length && partes.length < 4; siguiente += 1) {
      const texto = tokens[siguiente].texto;
      if (esPrecio(texto) || extraerMarca(texto)) break;
      if (/\*Precio|Máximo 24|ESTRELLA PRODUCTO/i.test(texto)) break;
      const limpio = limpiarDescripcion(texto);
      if (limpio) partes.push(limpio);
      if (/€\s*\/(?:kg|l|u|100)/i.test(texto)) break;
    }

    const descripcion = partes.join(" ").replace(/\s+/g, " ").trim();
    const precio = Number(
      tokens[indiceUltimoPrecio].texto.replace(",", "."),
    );
    if (
      descripcion.length < 4 ||
      !Number.isFinite(precio) ||
      precio <= 0
    ) {
      continue;
    }

    const nombre = `${marca} ${descripcion}`;
    const contextoOriginal: string[] = [];
    for (
      let contexto = indice + 1;
      contexto < tokens.length && contexto <= indice + 12;
      contexto += 1
    ) {
      const texto = tokens[contexto];
      if (
        esPrecio(texto.texto) ||
        (contexto > indice + 1 && extraerMarca(texto.texto))
      ) {
        break;
      }
      contextoOriginal.push(texto.texto);
    }
    const textoOriginal = contextoOriginal.join(" ");
    const referencia = referenciaDesdeTexto(textoOriginal);
    const precios = preciosPromocion(textoOriginal, precio);
    productos.push({
      identificadorExterno: identificadorProducto(marca, descripcion),
      ean: null,
      nombreOriginal: nombre,
      marcaOriginal: marca,
      categoriaOriginal: "Ofertas Covirán · País Vasco",
      categoriaSugerida: categoriaDesdeNombre(nombre),
      precio: precios.precio,
      precioPromocional: precios.precioPromocional,
      precioReferencia: referencia.precio,
      unidadReferencia: referencia.unidad,
      textoPromocion: [
        "Oferta de folleto",
        precios.detalle,
        tituloVigencia,
      ]
        .filter(Boolean)
        .join(" · "),
      fechaInicioPromocion: fechaInicio,
      fechaFinPromocion: fechaFin,
      disponible: true,
      urlProducto: `${URL_FOLLETO}?page=${pagina}`,
      urlImagen: urlImagenProducto(pagina, tokens[indice], fechaFin),
    });
    indice = siguiente - 1;
    indiceUltimoPrecio = -99;
  }

  return productos;
}

function extraerVigencia(texto: string): {
  fechaInicio: string;
  fechaFin: string;
  tituloVigencia: string;
} {
  const limpio = texto.replace(/\s+/g, " ");
  const coincidencia = limpio.match(
    /Válido del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i,
  );
  if (!coincidencia) {
    throw new Error("Covirán no publicó una vigencia reconocible en el folleto");
  }
  const mes = MESES[normalizar(coincidencia[3])];
  if (!mes) throw new Error("Covirán publicó un mes de vigencia no reconocido");

  const [, diaInicio, diaFin, nombreMes, anio] = coincidencia;
  const fechaInicio = `${anio}-${String(mes).padStart(2, "0")}-${diaInicio.padStart(2, "0")}T00:00:00+02:00`;
  const fechaFin = `${anio}-${String(mes).padStart(2, "0")}-${diaFin.padStart(2, "0")}T23:59:59+02:00`;
  return {
    fechaInicio,
    fechaFin,
    tituloVigencia: `válida del ${diaInicio} al ${diaFin} de ${nombreMes} de ${anio}`,
  };
}

async function descargarCatalogo(): Promise<CatalogoCoviran> {
  const respuesta = await fetch(URL_PDF, {
    cache: "no-store",
    headers: {
      Accept: "application/pdf",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Covirán respondió con estado ${respuesta.status}`);
  }

  const documento = await getDocument({
    data: new Uint8Array(await respuesta.arrayBuffer()),
  }).promise;
  const paginas: ElementoTexto[][] = [];
  for (let numero = 1; numero <= documento.numPages; numero += 1) {
    const pagina = await documento.getPage(numero);
    const contenido = await pagina.getTextContent();
    paginas.push(
      (contenido.items as ElementoTexto[])
        .map((item) => ({ ...item, str: item.str.trim() }))
        .filter((item) => Boolean(item.str)),
    );
  }

  const vigencia = extraerVigencia(
    paginas
      .flat()
      .map((item) => item.str)
      .join(" "),
  );
  if (Date.now() > new Date(vigencia.fechaFin).getTime()) {
    throw new Error(`El folleto de Covirán está caducado: ${vigencia.tituloVigencia}`);
  }

  const productos = paginas.flatMap((textos, indice) =>
    extraerProductosPagina({
      textos,
      pagina: indice + 1,
      ...vigencia,
    }),
  );
  const unicos = new Map(
    productos.map((producto) => [producto.identificadorExterno, producto]),
  );
  if (unicos.size === 0) {
    throw new Error("El folleto de Covirán no devolvió productos válidos");
  }
  return { productos: [...unicos.values()], ...vigencia };
}

export function obtenerCatalogoCoviran(): Promise<CatalogoCoviran> {
  const ahora = Date.now();
  if (
    !cacheCatalogo ||
    ahora - cacheCatalogo.creadaEn >= DURACION_CACHE_CATALOGO_MS
  ) {
    const promesa = descargarCatalogo().catch((error) => {
      if (cacheCatalogo?.promesa === promesa) {
        cacheCatalogo = null;
      }
      throw error;
    });
    cacheCatalogo = { creadaEn: ahora, promesa };
  }
  return cacheCatalogo.promesa;
}
