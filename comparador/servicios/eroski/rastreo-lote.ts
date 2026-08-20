import "server-only";

import { puntuacionRelevanciaProducto } from "@/servicios/busqueda/relevancia-producto";

import { obtenerCategoriaSugerida } from "./categorias-eroski";
import { rastrearProductosEroski } from "./cliente-eroski";
import type { ProductoEroski } from "./tipos-eroski";

export type ErrorRastreoEroski = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

export type ResultadoLoteEroski = {
  productos: ProductoEroski[];
  peticionesRealizadas: number;
  errores: ErrorRastreoEroski[];
  resultadosPorConsulta: Record<string, number>;
};

const PAUSA_ENTRE_PETICIONES_MS = 700;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

function consultasBusquedaEroski(consulta: string) {
  const normalizada = consulta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalizada === "pasta fresca rellena" || normalizada === "pasta rellena"
    ? ["ravioli", "tortellini"]
    : [consulta];
}

export async function rastrearLoteEroski({
  consultas,
  paginasPorConsulta,
  maxProductos,
  permitirVacio = false,
}: {
  consultas: string[];
  paginasPorConsulta: number;
  maxProductos: number;
  permitirVacio?: boolean;
}): Promise<ResultadoLoteEroski> {
  const productos = new Map<string, ProductoEroski>();
  const errores: ErrorRastreoEroski[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 0;
  let erroresConsecutivos = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    const encontradosConsulta = new Set<string>();
    for (const consultaBusqueda of consultasBusquedaEroski(consulta)) {
      if (productos.size >= maxProductos) break;
      for (let pagina = 0; pagina < paginasPorConsulta; pagina += 1) {
        if (productos.size >= maxProductos) break;

        if (peticionesRealizadas > 0) {
          await esperar(PAUSA_ENTRE_PETICIONES_MS);
        }

        try {
          const resultado = await rastrearProductosEroski(
            consultaBusqueda,
            pagina,
          );
          erroresConsecutivos = 0;
          peticionesRealizadas += 1;
          const categoriaSugerida = obtenerCategoriaSugerida(consulta);

          for (const producto of resultado.productos) {
            if (
              puntuacionRelevanciaProducto(producto.nombreOriginal, consulta) <= 0
            ) {
              continue;
            }
            encontradosConsulta.add(producto.identificadorExterno);
            if (!productos.has(producto.identificadorExterno)) {
              productos.set(producto.identificadorExterno, {
                ...producto,
                categoriaSugerida,
              });
            }
            if (productos.size >= maxProductos) break;
          }
        } catch (error) {
          peticionesRealizadas += 1;
          erroresConsecutivos += 1;
          const mensaje =
            error instanceof Error ? error.message : "Error desconocido";
          errores.push({
            consulta,
            pagina,
            mensaje: `${consultaBusqueda}: ${mensaje}`,
          });
          if (productos.size === 0 && erroresConsecutivos >= 3 && !permitirVacio) {
            throw new Error(`Eroski bloqueó las peticiones consecutivas. ${mensaje}`);
          }
        }
      }
    }
    productosEncontradosPorConsulta[consulta] = encontradosConsulta.size;
  }

  if (productos.size === 0 && !permitirVacio) {
    throw new Error("El rastreo no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
