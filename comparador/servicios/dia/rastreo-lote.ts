import "server-only";

import { rastrearProductosDia } from "./cliente-dia";
import type { ErrorRastreoDia, ProductoDia } from "./tipos-dia";

const PAUSA_ENTRE_PETICIONES_MS = 300;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteDia({
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
  productos: ProductoDia[];
  peticionesRealizadas: number;
  errores: ErrorRastreoDia[];
  codigoPostal: string | null;
  resultadosPorConsulta: Record<string, number>;
}> {
  const productos = new Map<string, ProductoDia>();
  const errores: ErrorRastreoDia[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 0;
  let codigoPostal: string | null = null;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_PETICIONES_MS);

    try {
      const resultado = await rastrearProductosDia({
        consulta,
        limite: Math.min(resultadosPorConsulta, maxProductos - productos.size),
      });
      peticionesRealizadas += resultado.peticionesRealizadas;
      productosEncontradosPorConsulta[consulta] = resultado.productos.length;
      codigoPostal = resultado.codigoPostal ?? codigoPostal;
      for (const producto of resultado.productos) {
        productos.set(producto.identificadorExterno, producto);
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
    throw new Error("El rastreo de DIA no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    codigoPostal,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
