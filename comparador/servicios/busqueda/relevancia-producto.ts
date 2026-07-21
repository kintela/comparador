import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";
import { obtenerVariantesSemanticas } from "@/servicios/busqueda/variantes-semanticas";

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function variantesConsulta(consulta: string) {
  const termino = normalizar(consulta);
  const palabras = termino.split(" ").filter(Boolean);
  const ultima = palabras.at(-1);
  const variantes = new Set([termino]);
  if (ultima && ultima.length > 4 && ultima.endsWith("es")) {
    variantes.add([...palabras.slice(0, -1), ultima.slice(0, -2)].join(" "));
  }
  if (ultima && ultima.length > 3 && ultima.endsWith("s")) {
    variantes.add([...palabras.slice(0, -1), ultima.slice(0, -1)].join(" "));
  }
  for (const variante of obtenerVariantesSemanticas(termino)) {
    variantes.add(normalizar(variante));
  }
  return [...variantes].filter(Boolean);
}

function singularizarPalabra(palabra: string) {
  if (palabra.length > 4 && palabra.endsWith("es")) {
    return palabra.slice(0, -2);
  }
  if (palabra.length > 3 && palabra.endsWith("s")) {
    return palabra.slice(0, -1);
  }
  return palabra;
}

function contienePalabrasCompletas(nombre: string, variante: string) {
  const palabrasNombre = nombre.split(" ").map(singularizarPalabra);
  const palabrasVariante = variante.split(" ").map(singularizarPalabra);
  if (palabrasVariante.length === 0) return false;

  return palabrasNombre.some((_, inicio) =>
    palabrasVariante.every(
      (palabra, desplazamiento) =>
        palabrasNombre[inicio + desplazamiento] === palabra,
    ),
  );
}

export function puntuacionRelevanciaProducto(
  nombreProducto: string,
  consulta: string,
) {
  const nombre = normalizar(nombreProducto);
  let mejor = 0;
  let comienzaPorConsulta = false;
  const variantes = variantesConsulta(consulta);

  for (const variante of variantes) {
    if (nombre === variante) {
      comienzaPorConsulta = true;
      mejor = Math.max(mejor, 1000);
    }
    else if (nombre.startsWith(`${variante} `)) {
      comienzaPorConsulta = true;
      mejor = Math.max(mejor, 800);
    }
    else if (contienePalabrasCompletas(nombre, variante)) {
      mejor = Math.max(mejor, 400);
    }
  }

  if (obtenerCategoriaSugerida(consulta) === "Frutas") {
    if (
      /\b(golosina|gominola|caramelo|bebida|refresco|zumo|yogur|yogurt|postre|gelatina|mermelada|sorbete|helado|stick|vaso|lata|conserva|almibar|gajos|ambientador|jabon|gel|champu|vodka|licor|potito|tarrito|galleta|chocolate|dulce|agua|colonia|spray|smoothie|preparado|flan|natillas|soja)\b/.test(
        nombre,
      )
    ) {
      return 0;
    }
    const formatoFrutaFresca =
      /\b(al peso|a granel|pieza|malla|bandeja|kg|kilo|kilos)\b/.test(nombre);
    if (!comienzaPorConsulta && !formatoFrutaFresca) return 0;
    if (/\b(al peso|a granel|pieza|malla|bandeja)\b/.test(nombre)) {
      mejor += 150;
    }
  }

  return mejor;
}
