import "server-only";

import { rastrearProductosBm } from "./cliente-bm";
import type { ErrorRastreoBm, ProductoBm } from "./tipos-bm";

const PAUSA_ENTRE_PETICIONES_MS = 250;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteBm({
  consultas,
  resultadosPorConsulta,
  maxProductos,
  permitirVacio = false,
}: {
  consultas: string[];
  resultadosPorConsulta: number;
  maxProductos: number;
  permitirVacio?: boolean;
}): Promise<{
  productos: ProductoBm[];
  peticionesRealizadas: number;
  errores: ErrorRastreoBm[];
  resultadosPorConsulta: Record<string, number>;
}> {
  const productos = new Map<string, ProductoBm>();
  const errores: ErrorRastreoBm[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_PETICIONES_MS);

    try {
      const resultado = await rastrearProductosBm({
        consulta,
        pagina: 1,
        limite: resultadosPorConsulta,
      });
      peticionesRealizadas += 1;
      productosEncontradosPorConsulta[consulta] = resultado.productos.length;

      for (const producto of resultado.productos) {
        if (!productos.has(producto.identificadorExterno)) {
          productos.set(producto.identificadorExterno, producto);
        }
        if (productos.size >= maxProductos) break;
      }
    } catch (error) {
      peticionesRealizadas += 1;
      errores.push({
        consulta,
        pagina: 1,
        mensaje: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  if (productos.size === 0 && !permitirVacio) {
    throw new Error("El rastreo de BM no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
