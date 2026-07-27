import "server-only";

import { rastrearProductosElCorteIngles } from "./cliente-el-corte-ingles";
import type {
  ErrorRastreoElCorteIngles,
  ProductoElCorteIngles,
} from "./tipos-el-corte-ingles";

const PAUSA_ENTRE_BUSQUEDAS_MS = 500;

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function rastrearLoteElCorteIngles({
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
  productos: ProductoElCorteIngles[];
  peticionesRealizadas: number;
  errores: ErrorRastreoElCorteIngles[];
  centroEntrega: string;
  resultadosPorConsulta: Record<string, number>;
}> {
  const productos = new Map<string, ProductoElCorteIngles>();
  const errores: ErrorRastreoElCorteIngles[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 0;
  let centroEntrega = "0130";

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_BUSQUEDAS_MS);

    try {
      const resultado = await rastrearProductosElCorteIngles({
        consulta,
        limite: Math.min(resultadosPorConsulta, maxProductos - productos.size),
      });
      peticionesRealizadas += resultado.peticionesRealizadas;
      productosEncontradosPorConsulta[consulta] = resultado.productos.length;
      centroEntrega = resultado.centroEntrega;
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
    const detalle = errores[0]?.mensaje;
    throw new Error(
      detalle
        ? `El rastreo de El Corte Inglés no devolvió productos. ${detalle}`
        : "El rastreo de El Corte Inglés no devolvió ningún producto válido",
    );
  }
  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    centroEntrega,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
