import "server-only";

import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";

import { obtenerCatalogoCoviran } from "./cliente-coviran";
import type { ErrorRastreoCoviran, ProductoCoviran } from "./tipos-coviran";

function normalizar(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 1)
    .map((token) =>
      token.length > 4 && token.endsWith("es")
        ? token.slice(0, -2)
        : token.length > 3 && token.endsWith("s")
          ? token.slice(0, -1)
          : token,
    );
}

function coincide(producto: ProductoCoviran, consulta: string): boolean {
  const categoriaConsulta = obtenerCategoriaSugerida(consulta);
  if (categoriaConsulta) {
    return producto.categoriaSugerida === categoriaConsulta;
  }
  const tokens = normalizar(
    `${producto.nombreOriginal} ${producto.categoriaSugerida ?? ""}`,
  );
  return normalizar(consulta).every((buscado) => tokens.includes(buscado));
}

export async function rastrearLoteCoviran({
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
  productos: ProductoCoviran[];
  peticionesRealizadas: number;
  errores: ErrorRastreoCoviran[];
  resultadosPorConsulta: Record<string, number>;
  vigencia: string;
}> {
  const catalogo = await obtenerCatalogoCoviran();
  const productos = new Map<string, ProductoCoviran>();
  const resultados: Record<string, number> = {};

  for (const consulta of consultas) {
    const encontrados = catalogo.productos
      .filter((producto) => coincide(producto, consulta))
      .slice(0, resultadosPorConsulta);
    resultados[consulta] = encontrados.length;
    for (const producto of encontrados) {
      productos.set(producto.identificadorExterno, producto);
      if (productos.size >= maxProductos) break;
    }
    if (productos.size >= maxProductos) break;
  }

  if (productos.size === 0 && !permitirVacio) {
    throw new Error(
      "El folleto de Covirán no contiene productos para las búsquedas indicadas",
    );
  }
  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas: 1,
    errores: [],
    resultadosPorConsulta: resultados,
    vigencia: catalogo.tituloVigencia,
  };
}
