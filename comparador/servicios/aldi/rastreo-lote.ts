import "server-only";

import { rastrearProductosAldi } from "./cliente-aldi";
import type { ErrorRastreoAldi, ProductoAldi } from "./tipos-aldi";

const PAUSA_ENTRE_PETICIONES_MS = 250;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteAldi({
  consultas,
  resultadosPorConsulta,
  maxProductos,
}: {
  consultas: string[];
  resultadosPorConsulta: number;
  maxProductos: number;
}): Promise<{
  productos: ProductoAldi[];
  peticionesRealizadas: number;
  errores: ErrorRastreoAldi[];
}> {
  const productos = new Map<string, ProductoAldi>();
  const errores: ErrorRastreoAldi[] = [];
  let peticionesRealizadas = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_PETICIONES_MS);

    try {
      const resultado = await rastrearProductosAldi({
        consulta,
        limite: resultadosPorConsulta,
      });
      peticionesRealizadas += 1;
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

  if (productos.size === 0) {
    throw new Error("El rastreo de ALDI no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
  };
}
