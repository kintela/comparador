import "server-only";

import { rastrearProductosAlcampo } from "./cliente-alcampo";
import type { ErrorRastreoAlcampo, ProductoAlcampo } from "./tipos-alcampo";

const PAUSA_ENTRE_BUSQUEDAS_MS = 350;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteAlcampo({
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
  productos: ProductoAlcampo[];
  peticionesRealizadas: number;
  errores: ErrorRastreoAlcampo[];
  regionId: string | null;
  resultadosPorConsulta: Record<string, number>;
}> {
  const productos = new Map<string, ProductoAlcampo>();
  const errores: ErrorRastreoAlcampo[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 0;
  let regionId: string | null = null;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_BUSQUEDAS_MS);

    try {
      const resultado = await rastrearProductosAlcampo({
        consulta,
        limite: Math.min(resultadosPorConsulta, maxProductos - productos.size),
      });
      peticionesRealizadas += resultado.peticionesRealizadas;
      productosEncontradosPorConsulta[consulta] = resultado.productos.length;
      regionId = resultado.regionId ?? regionId;
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
    throw new Error("El rastreo de Alcampo no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    regionId,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
