import "server-only";

import {
  buscarEnCatalogoPrimaprix,
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

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    const encontrados = buscarEnCatalogoPrimaprix({
      catalogo: catalogo.productos,
      consulta,
      limite: Math.min(
        resultadosPorConsulta,
        maxProductos - productos.size,
      ),
    });
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
    peticionesRealizadas: catalogo.peticionesRealizadas,
    errores: [],
    resultadosPorConsulta: encontradosPorConsulta,
  };
}
