import "server-only";

import { rastrearProductosAlcampo } from "./cliente-alcampo";
import type { ErrorRastreoAlcampo, ProductoAlcampo } from "./tipos-alcampo";

// Alcampo activa una respuesta anti-bot 202 cuando las búsquedas se encadenan
// demasiado deprisa. Mantener el lote por debajo de ese umbral sigue dejando
// margen suficiente dentro de los 300 s de la función programada.
const PAUSA_ENTRE_BUSQUEDAS_MS = 4_000;

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
  let erroresConsecutivos = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_BUSQUEDAS_MS);

    try {
      const resultado = await rastrearProductosAlcampo({
        consulta,
        limite: Math.min(resultadosPorConsulta, maxProductos - productos.size),
      });
      erroresConsecutivos = 0;
      peticionesRealizadas += resultado.peticionesRealizadas;
      productosEncontradosPorConsulta[consulta] = resultado.productos.length;
      regionId = resultado.regionId ?? regionId;
      for (const producto of resultado.productos) {
        productos.set(producto.identificadorExterno, producto);
        if (productos.size >= maxProductos) break;
      }
    } catch (error) {
      peticionesRealizadas += 1;
      erroresConsecutivos += 1;
      const mensaje =
        error instanceof Error ? error.message : "Error desconocido";
      errores.push({
        consulta,
        pagina: 1,
        mensaje,
      });
      if (productos.size === 0 && erroresConsecutivos >= 3 && !permitirVacio) {
        throw new Error(`Alcampo bloqueó las peticiones consecutivas. ${mensaje}`);
      }
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
