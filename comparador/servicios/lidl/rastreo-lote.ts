import "server-only";

import { rastrearProductosLidl } from "./cliente-lidl";
import type { ErrorRastreoLidl, ProductoLidl } from "./tipos-lidl";

const PAUSA_ENTRE_BUSQUEDAS_MS = 300;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteLidl({
  consultas,
  resultadosPorConsulta,
  maxProductos,
}: {
  consultas: string[];
  resultadosPorConsulta: number;
  maxProductos: number;
}): Promise<{
  productos: ProductoLidl[];
  peticionesRealizadas: number;
  errores: ErrorRastreoLidl[];
}> {
  const productos = new Map<string, ProductoLidl>();
  const errores: ErrorRastreoLidl[] = [];
  let peticionesRealizadas = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_BUSQUEDAS_MS);

    try {
      const resultado = await rastrearProductosLidl({
        consulta,
        limite: Math.min(resultadosPorConsulta, maxProductos - productos.size),
      });
      peticionesRealizadas += resultado.peticionesRealizadas;
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

  if (productos.size === 0) {
    throw new Error("El rastreo de Lidl no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
  };
}
