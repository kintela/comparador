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
} {
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
    };
  }

  return {
    total: precio * cantidad,
    precioPorPieza: null,
    pesoMedioPiezaKg,
    precioKg: null,
    estimado: false,
  };
}

export function etiquetaCantidadArticulo(consulta: string, cantidad: number) {
  const esPieza = obtenerPesoMedioPiezaKg(consulta) !== null;
  if (esPieza) return cantidad === 1 ? "pieza" : "piezas";
  return cantidad === 1 ? "unidad" : "unidades";
}
