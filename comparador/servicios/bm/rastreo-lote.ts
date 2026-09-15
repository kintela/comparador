import "server-only";

import { obtenerVariantesSemanticas } from "@/servicios/busqueda/variantes-semanticas";
import { normalizarTerminoRastreo } from "@/servicios/rastreo/terminos";

import {
  obtenerSugerenciasBusquedaBm,
  rastrearProductosBm,
} from "./cliente-bm";
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
  identificadoresPorConsulta: Record<string, string[]>;
}> {
  const productos = new Map<string, ProductoBm>();
  const errores: ErrorRastreoBm[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  const identificadoresPorConsulta: Record<string, string[]> = {};
  let peticionesRealizadas = 0;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    const encontradosPorId = new Map<string, ProductoBm>();
    const consultasEquivalentes = [
      consulta,
      ...obtenerVariantesSemanticas(normalizarTerminoRastreo(consulta)),
    ];

    for (const consultaEquivalente of consultasEquivalentes) {
      // Los sinónimos son una recuperación: si BM entendió la consulta literal,
      // conservamos exactamente los resultados que devolvió su buscador.
      if (consultaEquivalente !== consulta && encontradosPorId.size > 0) break;
      const limiteRestante = Math.min(
        resultadosPorConsulta - encontradosPorId.size,
        maxProductos - productos.size - encontradosPorId.size,
      );
      if (limiteRestante <= 0) break;
      if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_PETICIONES_MS);

      try {
        const resultado = await rastrearProductosBm({
          consulta: consultaEquivalente,
          pagina: 1,
          limite: limiteRestante,
        });
        peticionesRealizadas += 1;
        for (const producto of resultado.productos) {
          encontradosPorId.set(producto.identificadorExterno, producto);
        }
      } catch (error) {
        peticionesRealizadas += 1;
        errores.push({
          consulta: consultaEquivalente,
          pagina: 1,
          mensaje: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    if (encontradosPorId.size === 0) {
      if (peticionesRealizadas > 0) await esperar(PAUSA_ENTRE_PETICIONES_MS);
      try {
        const sugerencias = await obtenerSugerenciasBusquedaBm(consulta);
        peticionesRealizadas += 1;
        for (const sugerencia of sugerencias) {
          const limiteRestante = Math.min(
            resultadosPorConsulta - encontradosPorId.size,
            maxProductos - productos.size - encontradosPorId.size,
          );
          if (limiteRestante <= 0) break;
          await esperar(PAUSA_ENTRE_PETICIONES_MS);
          const resultado = await rastrearProductosBm({
            consulta: sugerencia,
            pagina: 1,
            limite: limiteRestante,
          });
          peticionesRealizadas += 1;
          for (const producto of resultado.productos) {
            encontradosPorId.set(producto.identificadorExterno, producto);
          }
          // BM presenta la primera alternativa con resultados como el bloque
          // de "Posibles resultados" de la búsqueda original.
          if (encontradosPorId.size > 0) break;
        }
      } catch (error) {
        peticionesRealizadas += 1;
        errores.push({
          consulta,
          pagina: 1,
          mensaje:
            error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    productosEncontradosPorConsulta[consulta] = encontradosPorId.size;
    identificadoresPorConsulta[consulta] = [...encontradosPorId.keys()];
    for (const producto of encontradosPorId.values()) {
      productos.set(producto.identificadorExterno, producto);
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
    identificadoresPorConsulta,
  };
}
