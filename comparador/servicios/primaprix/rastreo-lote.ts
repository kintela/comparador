import "server-only";

import { obtenerVariantesSemanticas } from "@/servicios/busqueda/variantes-semanticas";
import { normalizarTerminoRastreo } from "@/servicios/rastreo/terminos";

import {
  buscarEnCatalogoPrimaprix,
  buscarEnWebPrimaprix,
  cargarCatalogoPrimaprix,
} from "./cliente-primaprix";
import type {
  ErrorRastreoPrimaprix,
  ProductoPrimaprix,
} from "./tipos-primaprix";

export async function rastrearLotePrimaprix({
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
  productos: ProductoPrimaprix[];
  peticionesRealizadas: number;
  errores: ErrorRastreoPrimaprix[];
  resultadosPorConsulta: Record<string, number>;
}> {
  const catalogo = await cargarCatalogoPrimaprix();
  const productos = new Map<string, ProductoPrimaprix>();
  const encontradosPorConsulta: Record<string, number> = {};
  const errores: ErrorRastreoPrimaprix[] = [];
  let peticionesRealizadas = catalogo.peticionesRealizadas;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    const consultasEquivalentes = [
      consulta,
      ...obtenerVariantesSemanticas(normalizarTerminoRastreo(consulta)),
    ];
    const encontradosPorId = new Map<string, ProductoPrimaprix>();

    for (const consultaEquivalente of consultasEquivalentes) {
      const limiteRestante = Math.min(
        resultadosPorConsulta - encontradosPorId.size,
        maxProductos - productos.size - encontradosPorId.size,
      );
      if (limiteRestante <= 0) break;

      for (const producto of buscarEnCatalogoPrimaprix({
        catalogo: catalogo.productos,
        consulta: consultaEquivalente,
        limite: limiteRestante,
      })) {
        encontradosPorId.set(producto.identificadorExterno, producto);
      }
    }

    let encontrados = [...encontradosPorId.values()];
    if (encontrados.length === 0) {
      for (const consultaEquivalente of consultasEquivalentes) {
        const limiteRestante = Math.min(
          resultadosPorConsulta - encontradosPorId.size,
          maxProductos - productos.size - encontradosPorId.size,
        );
        if (limiteRestante <= 0) break;

        try {
          const resultadoWeb = await buscarEnWebPrimaprix({
            consulta: consultaEquivalente,
            limite: limiteRestante,
          });
          peticionesRealizadas += resultadoWeb.peticionesRealizadas;
          for (const producto of resultadoWeb.productos) {
            encontradosPorId.set(producto.identificadorExterno, producto);
          }
        } catch (error) {
          errores.push({
            consulta: consultaEquivalente,
            pagina: 1,
            mensaje:
              error instanceof Error ? error.message : "Error desconocido",
          });
        }
      }
      encontrados = [...encontradosPorId.values()];
    }
    encontradosPorConsulta[consulta] = encontrados.length;
    for (const producto of encontrados) {
      productos.set(producto.identificadorExterno, producto);
    }
  }

  if (productos.size === 0 && !permitirVacio) {
    throw new Error(
      "El catálogo web de Primaprix no devolvió productos para esas búsquedas",
    );
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    resultadosPorConsulta: encontradosPorConsulta,
  };
}
