import { crearSlug } from "@/servicios/eroski/categorias-eroski";

const PESO_MEDIO_KG_POR_PIEZA: Record<string, number> = {
  mandarina: 0.12,
  naranja: 0.18,
  manzana: 0.18,
  pera: 0.18,
  platano: 0.18,
  kiwi: 0.09,
  limon: 0.12,
  fresa: 0.02,
  melocoton: 0.15,
  nectarina: 0.15,
  ciruela: 0.07,
  aguacate: 0.2,
  melon: 2.5,
  sandia: 5,
  tomate: 0.2,
  cebolla: 0.2,
  patata: 0.2,
  pepino: 0.3,
  pimiento: 0.2,
  calabacin: 0.25,
  berenjena: 0.3,
};

export type ReferenciaComparacion = {
  cantidad: number;
  unidad: "KG" | "L" | "UD";
  cantidadBase: number;
  unidadVisual: "g" | "ml" | "ud.";
};

type ProductoMedible = {
  nombreProducto: string;
  precioReferencia: number | null;
  unidadReferencia: string | null;
};

function singularizar(termino: string) {
  if (termino.length > 4 && termino.endsWith("es")) return termino.slice(0, -2);
  if (termino.length > 3 && termino.endsWith("s")) return termino.slice(0, -1);
  return termino;
}

export function obtenerPesoMedioPiezaKg(consulta: string): number | null {
  const termino = crearSlug(consulta).replaceAll("-", " ");
  const ultimaPalabra = termino.split(" ").at(-1) ?? termino;
  return PESO_MEDIO_KG_POR_PIEZA[singularizar(ultimaPalabra)] ?? null;
}

function esPrecioPorKilogramo(unidad: string | null) {
  if (!unidad) return false;
  const normalizada = crearSlug(unidad).replaceAll("-", " ");
  return normalizada === "kg" || normalizada.includes("kilogram");
}

function esPrecioPorLitro(unidad: string | null) {
  if (!unidad) return false;
  const normalizada = crearSlug(unidad).replaceAll("-", " ");
  return normalizada === "l" || normalizada.includes("litro");
}

function pesoEnvaseKg(nombreProducto: string | undefined): {
  pesoKg: number;
  texto: string;
} | null {
  if (!nombreProducto) return null;
  const nombre = nombreProducto.toLocaleLowerCase("es");
  const pack = nombre.match(
    /(\d+)\s*(?:x|unidades?\s+de)\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|grs?\.?|gramos?)\b/i,
  );
  if (pack) {
    const unidades = Number(pack[1]);
    const cantidad = Number(pack[2].replace(",", "."));
    const esKg = /^kg|^kilo/i.test(pack[3]);
    const pesoKg = unidades * (esKg ? cantidad : cantidad / 1000);
    if (Number.isFinite(pesoKg) && pesoKg > 0) {
      return {
        pesoKg,
        texto: `${unidades} × ${cantidad.toLocaleString("es-ES")} ${esKg ? "kg" : "g"}`,
      };
    }
  }

  const cantidades = [
    ...nombre.matchAll(
      /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|grs?\.?|gramos?)\b/gi,
    ),
  ];
  const simple = cantidades.at(-1);
  if (!simple) return null;
  const cantidad = Number(simple[1].replace(",", "."));
  const esKg = /^kg|^kilo/i.test(simple[2]);
  const pesoKg = esKg ? cantidad : cantidad / 1000;
  return Number.isFinite(pesoKg) && pesoKg > 0
    ? {
        pesoKg,
        texto: `${cantidad.toLocaleString("es-ES")} ${esKg ? "kg" : "g"}`,
      }
    : null;
}

function unidadesEnvase(nombreProducto: string | undefined): {
  unidades: number;
  texto: string;
} | null {
  if (!nombreProducto) return null;
  const nombre = nombreProducto.toLocaleLowerCase("es");
  const coincidencia = nombre.match(
    /(?:pack\s*(?:de)?\s*|(?:lote|caja)\s*(?:de)?\s*)?(\d+)\s*(unidades?|uds?\.?|rollos?|capsulas?|lavados?|dosis|sobres?|botellas?|latas?|briks?|paquetes?)\b/i,
  );
  if (!coincidencia) return null;
  const unidades = Number(coincidencia[1]);
  return Number.isFinite(unidades) && unidades > 0
    ? { unidades, texto: `${unidades} ud.` }
    : null;
}

function dimensionProducto(producto: ProductoMedible) {
  if (esPrecioPorKilogramo(producto.unidadReferencia)) return "KG" as const;
  if (esPrecioPorLitro(producto.unidadReferencia)) return "L" as const;
  if (pesoEnvaseKg(producto.nombreProducto)) return "KG" as const;
  if (volumenEnvaseL(producto.nombreProducto)) return "L" as const;
  if (unidadesEnvase(producto.nombreProducto)) return "UD" as const;
  return null;
}

/**
 * Obtiene una referencia única para toda la fila sin depender del producto
 * buscado. La mediana evita que un formato mayorista aislado determine la
 * cantidad y los escalones producen referencias fáciles de interpretar.
 */
export function crearReferenciaComparacionAutomatica(
  consulta: string,
  productos: ProductoMedible[],
): ReferenciaComparacion | null {
  if (obtenerPesoMedioPiezaKg(consulta) !== null) return null;

  const dimensiones = productos
    .map(dimensionProducto)
    .filter((dimension): dimension is "KG" | "L" | "UD" => dimension !== null);
  if (dimensiones.length === 0) return null;

  const conteos = dimensiones.reduce(
    (acumulado, dimension) => ({
      ...acumulado,
      [dimension]: acumulado[dimension] + 1,
    }),
    { KG: 0, L: 0, UD: 0 },
  );
  const unidad = (Object.entries(conteos) as Array<["KG" | "L" | "UD", number]>)
    .sort((a, b) => b[1] - a[1])[0][0];

  if (unidad === "UD") {
    return { cantidad: 1, unidad, cantidadBase: 1, unidadVisual: "ud." };
  }

  const cantidades = productos
    .filter((producto) => dimensionProducto(producto) === unidad)
    .map((producto) =>
      unidad === "KG"
        ? (pesoEnvaseKg(producto.nombreProducto)?.pesoKg ?? null)
        : (volumenEnvaseL(producto.nombreProducto)?.volumenL ?? null),
    )
    .filter((cantidad): cantidad is number => cantidad !== null)
    .sort((a, b) => a - b);
  const mediana = cantidades.length > 0
    ? cantidades[Math.floor(cantidades.length / 2)]
    : 0.1;
  const cantidadBase = mediana <= 0.25 ? 100 : mediana <= 0.75 ? 500 : 1000;

  return {
    cantidad: cantidadBase / 1000,
    unidad,
    cantidadBase,
    unidadVisual: unidad === "KG" ? "g" : "ml",
  };
}

function volumenEnvaseL(nombreProducto: string | undefined): {
  volumenL: number;
  texto: string;
} | null {
  if (!nombreProducto) return null;
  const nombre = nombreProducto.toLocaleLowerCase("es");
  const pack = nombre.match(
    /(\d+)\s*(?:x|unidades?\s+de)\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|l|litros?)\b/i,
  );
  if (pack) {
    const unidades = Number(pack[1]);
    const cantidad = Number(pack[2].replace(",", "."));
    const unidad = pack[3].toLocaleLowerCase("es");
    const factorLitros = unidad === "cl" ? 0.01 : unidad === "ml" ? 0.001 : 1;
    const volumenL = unidades * cantidad * factorLitros;
    if (Number.isFinite(volumenL) && volumenL > 0) {
      return {
        volumenL,
        texto: `${unidades} × ${cantidad.toLocaleString("es-ES")} ${unidad.startsWith("litro") ? "l" : unidad}`,
      };
    }
  }

  const cantidades = [
    ...nombre.matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|cl|l|litros?)\b/gi),
  ];
  const simple = cantidades.at(-1);
  if (!simple) return null;
  const cantidad = Number(simple[1].replace(",", "."));
  const unidad = simple[2].toLocaleLowerCase("es");
  const factorLitros = unidad === "cl" ? 0.01 : unidad === "ml" ? 0.001 : 1;
  const volumenL = cantidad * factorLitros;
  return Number.isFinite(volumenL) && volumenL > 0
    ? {
        volumenL,
        texto: `${cantidad.toLocaleString("es-ES")} ${unidad.startsWith("litro") ? "l" : unidad}`,
      }
    : null;
}

export function calcularCosteArticulo({
  consulta,
  cantidad,
  precio,
  precioReferencia,
  unidadReferencia,
  nombreProducto,
  referenciaComparacion,
}: {
  consulta: string;
  cantidad: number;
  precio: number;
  precioReferencia: number | null;
  unidadReferencia: string | null;
  nombreProducto?: string;
  referenciaComparacion?: ReferenciaComparacion | null;
}): {
  total: number;
  precioPorPieza: number | null;
  pesoMedioPiezaKg: number | null;
  precioKg: number | null;
  estimado: boolean;
  normalizado: boolean;
  cantidadComparableTexto: string | null;
  cantidadEnvaseTexto: string | null;
  notaComparacion: string | null;
  unidadComparable: "kg" | "l" | "ud." | null;
} {
  const comparable = referenciaComparacion ?? null;
  const pesoEnvase = pesoEnvaseKg(nombreProducto);
  const volumenEnvase = volumenEnvaseL(nombreProducto);
  const unidades = unidadesEnvase(nombreProducto);
  let precioUnidadComparable: number | null = null;
  if (comparable?.unidad === "KG") {
    precioUnidadComparable =
      precioReferencia !== null && esPrecioPorKilogramo(unidadReferencia)
        ? precioReferencia
        : pesoEnvase
          ? precio / pesoEnvase.pesoKg
          : null;
  } else if (comparable?.unidad === "L") {
    if (precioReferencia !== null && esPrecioPorLitro(unidadReferencia)) {
      precioUnidadComparable = precioReferencia;
    } else if (volumenEnvase) {
      precioUnidadComparable = precio / volumenEnvase.volumenL;
    }
  } else if (comparable?.unidad === "UD" && unidades) {
    precioUnidadComparable = precio / unidades.unidades;
  }
  if (comparable && precioUnidadComparable !== null) {
    const cantidadTotal = comparable.cantidadBase * cantidad;
    return {
      total: precioUnidadComparable * comparable.cantidad * cantidad,
      precioPorPieza: null,
      pesoMedioPiezaKg: null,
      precioKg: precioUnidadComparable,
      estimado: false,
      normalizado: true,
      cantidadComparableTexto: `${cantidadTotal.toLocaleString("es-ES")} ${comparable.unidadVisual}`,
      cantidadEnvaseTexto:
        volumenEnvase?.texto ?? pesoEnvase?.texto ?? unidades?.texto ?? null,
      notaComparacion: null,
      unidadComparable: comparable.unidad === "UD"
        ? "ud."
        : comparable.unidad.toLocaleLowerCase("es") as "kg" | "l",
    };
  }

  const pesoMedioPiezaKg = obtenerPesoMedioPiezaKg(consulta);
  const ventaAlPeso = /\b(al peso|a granel)\b/.test(
    crearSlug(nombreProducto ?? "").replaceAll("-", " "),
  );
  const precioKg =
    pesoMedioPiezaKg !== null &&
    ((precioReferencia !== null && esPrecioPorKilogramo(unidadReferencia)) ||
      ventaAlPeso)
      ? (precioReferencia ?? precio)
      : null;

  if (pesoMedioPiezaKg !== null && precioKg !== null) {
    const precioPorPieza = precioKg * pesoMedioPiezaKg;
    return {
      total: precioPorPieza * cantidad,
      precioPorPieza,
      pesoMedioPiezaKg,
      precioKg,
      estimado: true,
      normalizado: false,
      cantidadComparableTexto: null,
      cantidadEnvaseTexto: null,
      notaComparacion: null,
      unidadComparable: null,
    };
  }

  return {
    total: precio * cantidad,
    precioPorPieza: null,
    pesoMedioPiezaKg,
    precioKg: null,
    estimado: false,
    normalizado: false,
    cantidadComparableTexto: null,
    cantidadEnvaseTexto: null,
    notaComparacion: null,
    unidadComparable: null,
  };
}

export function etiquetaCantidadArticulo(
  consulta: string,
  cantidad: number,
  comparable?: ReferenciaComparacion | null,
) {
  if (comparable) {
    return cantidad === 1
      ? `ración de ${comparable.cantidadBase} ${comparable.unidadVisual}`
      : `raciones de ${comparable.cantidadBase} ${comparable.unidadVisual}`;
  }
  const esPieza = obtenerPesoMedioPiezaKg(consulta) !== null;
  if (esPieza) return cantidad === 1 ? "pieza" : "piezas";
  return cantidad === 1 ? "unidad" : "unidades";
}
