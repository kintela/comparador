import "server-only";

import {
  obtenerIndiceCategoriasMercadona,
  rastrearCategoriaMercadona,
  resolverZonaMercadona,
} from "./cliente-mercadona";
import type {
  CategoriaMercadona,
  ErrorRastreoMercadona,
  ProductoMercadona,
  ZonaMercadona,
} from "./tipos-mercadona";

const PAUSA_ENTRE_PETICIONES_MS = 250;

const CATEGORIAS_POR_CONSULTA: Record<string, number[]> = {
  leche: [72],
  huevos: [77],
  pan: [59, 60],
  arroz: [118],
  pasta: [120],
  aceite: [112],
  harina: [69],
  azucar: [89],
  cafe: [81, 83, 84],
  agua: [156],
  yogur: [103, 104, 105, 108, 109],
  queso: [53, 54, 56],
  mantequilla: [75],
  pollo: [38],
  carne: [37, 40, 44, 45],
  pescado: [31, 34, 122, 149],
  verduras: [29, 127, 145],
  fruta: [27, 127, 145],
  legumbres: [121],
  conservas: [122, 123, 127],
  cereales: [78],
  galletas: [80],
  "papel higienico": [238],
  detergente: [226],
  champu: [199],
};

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function categoriasPlanas(categorias: CategoriaMercadona[]): CategoriaMercadona[] {
  return categorias.flatMap((categoria) => [
    categoria,
    ...categoriasPlanas(categoria.categories ?? []),
  ]);
}

function resolverCategorias(
  consulta: string,
  indice: CategoriaMercadona[],
): number[] {
  const consultaNormalizada = normalizar(consulta);
  const predefinidas = CATEGORIAS_POR_CONSULTA[consultaNormalizada];
  if (predefinidas) return predefinidas;

  const palabras = consultaNormalizada.split(" ").filter((palabra) => palabra.length > 2);
  return categoriasPlanas(indice)
    .filter((categoria) => {
      const nombre = normalizar(categoria.name);
      return (
        nombre.includes(consultaNormalizada) ||
        palabras.some((palabra) => nombre.split(" ").includes(palabra))
      );
    })
    .map((categoria) => categoria.id);
}

export async function rastrearLoteMercadona({
  consultas,
  resultadosPorConsulta,
  maxProductos,
  codigoPostal,
  permitirVacio = false,
}: {
  consultas: string[];
  resultadosPorConsulta: number;
  maxProductos: number;
  codigoPostal: string;
  permitirVacio?: boolean;
}): Promise<{
  productos: ProductoMercadona[];
  peticionesRealizadas: number;
  errores: ErrorRastreoMercadona[];
  zona: ZonaMercadona;
  resultadosPorConsulta: Record<string, number>;
}> {
  const zona = await resolverZonaMercadona(codigoPostal);
  const indice = await obtenerIndiceCategoriasMercadona(zona.almacen);
  const productos = new Map<string, ProductoMercadona>();
  const cacheCategorias = new Map<number, ProductoMercadona[]>();
  const errores: ErrorRastreoMercadona[] = [];
  const productosEncontradosPorConsulta: Record<string, number> = {};
  let peticionesRealizadas = 2;

  for (const consulta of consultas) {
    if (productos.size >= maxProductos) break;
    productosEncontradosPorConsulta[consulta] = 0;
    const categoriaIds = resolverCategorias(consulta, indice);
    if (categoriaIds.length === 0) {
      errores.push({
        consulta,
        mensaje: "No se encontró una categoría adecuada para esta búsqueda",
      });
      continue;
    }

    const candidatos: ProductoMercadona[] = [];
    for (const categoriaId of categoriaIds) {
      if (productos.size >= maxProductos || candidatos.length >= resultadosPorConsulta) {
        break;
      }
      try {
        let productosCategoria = cacheCategorias.get(categoriaId);
        if (!productosCategoria) {
          await esperar(PAUSA_ENTRE_PETICIONES_MS);
          productosCategoria = await rastrearCategoriaMercadona({
            categoriaId,
            almacen: zona.almacen,
            consulta,
          });
          cacheCategorias.set(categoriaId, productosCategoria);
          peticionesRealizadas += 1;
        }
        candidatos.push(...productosCategoria);
      } catch (error) {
        peticionesRealizadas += 1;
        errores.push({
          consulta,
          categoriaId,
          mensaje: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    const consultaNormalizada = normalizar(consulta);
    const ordenados = [...candidatos].sort((a, b) => {
      const coincideA = normalizar(a.nombreOriginal).includes(consultaNormalizada);
      const coincideB = normalizar(b.nombreOriginal).includes(consultaNormalizada);
      return Number(coincideB) - Number(coincideA);
    });
    const encontrados = ordenados.slice(0, resultadosPorConsulta);
    productosEncontradosPorConsulta[consulta] = encontrados.length;
    for (const producto of encontrados) {
      if (!productos.has(producto.identificadorExterno)) {
        productos.set(producto.identificadorExterno, producto);
      }
      if (productos.size >= maxProductos) break;
    }
  }

  if (productos.size === 0 && !permitirVacio) {
    throw new Error("El rastreo de Mercadona no devolvió ningún producto válido");
  }

  return {
    productos: [...productos.values()].slice(0, maxProductos),
    peticionesRealizadas,
    errores,
    zona,
    resultadosPorConsulta: productosEncontradosPorConsulta,
  };
}
