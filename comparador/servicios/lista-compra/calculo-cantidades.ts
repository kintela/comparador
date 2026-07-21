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

const CANTIDAD_COMPARABLE_POR_TERMINO: Record<
  string,
  { cantidad: number; unidad: "KG"; gramos: number }
> = {
  gula: { cantidad: 0.1, unidad: "KG", gramos: 100 },
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

function referenciaComparable(consulta: string) {
  const termino = crearSlug(consulta).replaceAll("-", " ");
  const ultimaPalabra = termino.split(" ").at(-1) ?? termino;
  return CANTIDAD_COMPARABLE_POR_TERMINO[singularizar(ultimaPalabra)] ?? null;
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

export function calcularCosteArticulo({
  consulta,
  cantidad,
  precio,
  precioReferencia,
  unidadReferencia,
  nombreProducto,
}: {
  consulta: string;
  cantidad: number;
  precio: number;
  precioReferencia: number | null;
  unidadReferencia: string | null;
  nombreProducto?: string;
}): {
  total: number;
  precioPorPieza: number | null;
  pesoMedioPiezaKg: number | null;
  precioKg: number | null;
  estimado: boolean;
  normalizado: boolean;
  cantidadComparableTexto: string | null;
  cantidadEnvaseTexto: string | null;
} {
  const comparable = referenciaComparable(consulta);
  const envase = pesoEnvaseKg(nombreProducto);
  const precioKgComparable =
    comparable?.unidad === "KG"
      ? precioReferencia !== null && esPrecioPorKilogramo(unidadReferencia)
        ? precioReferencia
        : envase
          ? precio / envase.pesoKg
          : null
      : null;
  if (comparable && precioKgComparable !== null) {
    const gramosTotales = comparable.gramos * cantidad;
    return {
      total: precioKgComparable * comparable.cantidad * cantidad,
      precioPorPieza: null,
      pesoMedioPiezaKg: null,
      precioKg: precioKgComparable,
      estimado: false,
      normalizado: true,
      cantidadComparableTexto: `${gramosTotales.toLocaleString("es-ES")} g`,
      cantidadEnvaseTexto: envase?.texto ?? null,
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
  };
}

export function etiquetaCantidadArticulo(consulta: string, cantidad: number) {
  const comparable = referenciaComparable(consulta);
  if (comparable) {
    return cantidad === 1
      ? `ración de ${comparable.gramos} g`
      : `raciones de ${comparable.gramos} g`;
  }
  const esPieza = obtenerPesoMedioPiezaKg(consulta) !== null;
  if (esPieza) return cantidad === 1 ? "pieza" : "piezas";
  return cantidad === 1 ? "unidad" : "unidades";
}
