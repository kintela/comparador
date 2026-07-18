import "server-only";

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

const PAUSA_ENTRE_PETICIONES_MS = 250;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
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

  bucleConsultas: for (const consulta of consultas) {
    productosEncontradosPorConsulta[consulta] = 0;
    for (let pagina = 0; pagina < paginasPorConsulta; pagina += 1) {
      if (productos.size >= maxProductos) break bucleConsultas;

      if (peticionesRealizadas > 0) {
        await esperar(PAUSA_ENTRE_PETICIONES_MS);
      }

      try {
        const resultado = await rastrearProductosEroski(consulta, pagina);
        peticionesRealizadas += 1;
        productosEncontradosPorConsulta[consulta] += resultado.productos.length;
        const categoriaSugerida = obtenerCategoriaSugerida(consulta);

        for (const producto of resultado.productos) {
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
        errores.push({
          consulta,
          pagina,
          mensaje: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }
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
