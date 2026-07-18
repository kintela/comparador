import "server-only";

import { rastrearProductosLupa } from "./cliente-lupa";
import type { ErrorRastreoLupa, ProductoLupa } from "./tipos-lupa";

const PAUSA_ENTRE_BUSQUEDAS_MS = 300;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteLupa({
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
  productos: ProductoLupa[];
  peticionesRealizadas: number;
  errores: ErrorRastreoLupa[];
  resultadosPorConsulta: Record<string, number>;
}> {
  const productos = new Map<string, ProductoLupa>();
  const errores: ErrorRastreoLupa[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_BUSQUEDAS_MS);
    try {
      const resultado = await rastrearProductosLupa({
        consulta,
        limite: Math.min(resultadosPorConsulta, maxProductos - productos.size),
      });
      peticionesRealizadas += resultado.peticionesRealizadas;
      productosEncontradosPorConsulta[consulta] = resultado.productos.length;
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
    throw new Error("El rastreo de Lupa no devolvió ningún producto válido");
  }
  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
