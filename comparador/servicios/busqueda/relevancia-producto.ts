import { obtenerCategoriaSugerida } from "@/servicios/eroski/categorias-eroski";
import { obtenerVariantesSemanticas } from "@/servicios/busqueda/variantes-semanticas";

const PALABRAS_NO_SIGNIFICATIVAS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "sin",
  "y",
]);

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
  let singular = palabra;
  if (palabra.length > 4 && palabra.endsWith("es")) {
    singular = palabra.slice(0, -2);
  }
  else if (palabra.length > 3 && palabra.endsWith("s")) {
    singular = palabra.slice(0, -1);
  }
  return singular === "campero" || singular === "campera"
    ? "camper"
    : singular;
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

function comienzaPorPalabrasEquivalentes(nombre: string, variante: string) {
  const palabrasNombre = nombre.split(" ").map(singularizarPalabra);
  const palabrasVariante = variante.split(" ").map(singularizarPalabra);
  return (
    palabrasVariante.length > 0 &&
    palabrasVariante.every(
      (palabra, indice) => palabrasNombre[indice] === palabra,
    )
  );
}

function crearFormasCompuestas(palabras: string[]) {
  const formas = new Set<string>();

  for (let inicio = 0; inicio < palabras.length; inicio += 1) {
    let forma = "";
    for (let fin = inicio; fin < palabras.length; fin += 1) {
      forma += palabras[fin];
      formas.add(forma);
    }
  }

  return formas;
}

function contarPalabrasCoincidentes(nombre: string, variante: string) {
  const palabrasNombre = nombre.split(" ").map(singularizarPalabra);
  const palabrasConsulta = variante.split(" ").map(singularizarPalabra);
  const formasNombre = crearFormasCompuestas(palabrasNombre);
  const coincidencias = new Set<string>();

  // Compara también grupos contiguos sin espacios. Así, una marca escrita
  // como “Elpozo” equivale a “El Pozo” y “Cocacola” a “Coca Cola”, en ambos
  // sentidos, sin convertir una coincidencia parcial en palabra válida.
  for (let inicio = 0; inicio < palabrasConsulta.length; inicio += 1) {
    let forma = "";
    for (let fin = inicio; fin < palabrasConsulta.length; fin += 1) {
      forma += palabrasConsulta[fin];
      if (!formasNombre.has(forma)) continue;

      for (let indice = inicio; indice <= fin; indice += 1) {
        const palabra = palabrasConsulta[indice];
        if (!PALABRAS_NO_SIGNIFICATIVAS.has(palabra)) {
          coincidencias.add(palabra);
        }
      }
    }
  }

  return coincidencias.size;
}

export function puntuacionRelevanciaProducto(
  nombreProducto: string,
  consulta: string,
) {
  const nombre = normalizar(nombreProducto);
  const consultaNormalizada = normalizar(consulta);
  let mejor = 0;
  let comienzaPorConsulta = false;
  const variantes = variantesConsulta(consulta);

  for (const variante of variantes) {
    if (nombre === variante) {
      comienzaPorConsulta = true;
      mejor = Math.max(mejor, 1000);
    }
    else if (
      nombre.startsWith(`${variante} `) ||
      comienzaPorPalabrasEquivalentes(nombre, variante)
    ) {
      comienzaPorConsulta = true;
      mejor = Math.max(mejor, 800);
    }
    else if (contienePalabrasCompletas(nombre, variante)) {
      mejor = Math.max(mejor, 400);
    } else {
      const totalPalabras = new Set(
        variante
          .split(" ")
          .map(singularizarPalabra)
          .filter((palabra) => !PALABRAS_NO_SIGNIFICATIVAS.has(palabra)),
      ).size;
      const palabrasCoincidentes = contarPalabrasCoincidentes(nombre, variante);
      const minimoCoincidencias = Math.min(totalPalabras, 2);

      if (palabrasCoincidentes === totalPalabras) {
        mejor = Math.max(mejor, 300);
      } else if (palabrasCoincidentes >= minimoCoincidencias) {
        mejor = Math.max(mejor, 200 + palabrasCoincidentes * 20);
      }
    }
  }

  if (obtenerCategoriaSugerida(consulta) === "Frutas") {
    const formatoFrutaFresca =
      /\b(al peso|a granel|pieza|malla|bandeja|kg|kilo|kilos|g|gr|gramo|gramos)\b/.test(
        nombre,
      );
    if (
      /\b(golosina|gominola|caramelo|bebida|refresco|yogur|yogurt|postre|gelatina|mermelada|sorbete|helado|stick|vaso|lata|conserva|almibar|gajos|ambientador|jabon|gel|champu|vodka|licor|potito|tarrito|papilla|papillas|barrita|barritas|galleta|chocolate|dulce|agua|colonia|spray|smoothie|preparado|flan|natillas|soja)\b/.test(
        nombre,
      )
    ) {
      return 0;
    }
    // El formato por peso no basta para relacionar frutas distintas:
    // una malla de naranjas no es una coincidencia para “mandarinas”.
    if (mejor === 0) return 0;
    // “Naranja para zumo malla” es fruta fresca; “zumo de naranja” no.
    if (/\bzumo\b/.test(nombre) && !formatoFrutaFresca) return 0;
    if (!comienzaPorConsulta && !formatoFrutaFresca) return 0;
    if (
      /\b(al peso|a granel|pieza|malla|bandeja|kg|kilo|kilos|g|gr|gramo|gramos)\b/.test(
        nombre,
      )
    ) {
      mejor += 150;
    }
  }

  if (
    variantes.some((variante) =>
      variante.split(" ").map(singularizarPalabra).includes("patata"),
    ) &&
    /\b(frita|fritas|prefrita|tortilla|ali oli|alioli|gnocchi|finisima|al corte|entera|pure|snack)\b/.test(
      nombre,
    )
  ) {
    return 0;
  }

  if (
    variantes.some((variante) =>
      variante.split(" ").map(singularizarPalabra).includes("huevo"),
    ) &&
    /\b(tortilla|mayonesa|salsa|pasta|flan|natillas|bizcocho|galleta|galletas|rebozado|ensaladilla|revuelto|preparado)\b/.test(
      nombre,
    )
  ) {
    return 0;
  }

  if (
    variantes.some((variante) =>
      variante.split(" ").map(singularizarPalabra).includes("queso"),
    ) &&
    !/\b(crema|untar|untable)\b/.test(consultaNormalizada) &&
    /\bqueso\b/.test(nombre) &&
    /\b(crema|untar|untable)\b/.test(nombre)
  ) {
    return 0;
  }

  if (
    variantes.some((variante) =>
      variante.split(" ").map(singularizarPalabra).includes("queso"),
    ) &&
    !/\bfresc(?:o|a|os|as)\b/.test(consultaNormalizada) &&
    /\bqueso\b/.test(nombre) &&
    /\bfresc(?:o|a|os|as)\b/.test(nombre)
  ) {
    return 0;
  }

  if (
    ["melon", "melones"].includes(consultaNormalizada) &&
    /\b(sandias?|golosina|gominola|caramelo|chicle|bolsa|semilla|semillas)\b/.test(
      nombre,
    )
  ) {
    return 0;
  }
  if (
    ["sandia", "sandias"].includes(consultaNormalizada) &&
    /\bmelon(?:es)?\b/.test(nombre)
  ) {
    return 0;
  }
  if (
    consultaNormalizada === "sal negra" &&
    !/\bsal(?:\s+(?:marina|himalaya|del\s+himalaya))?\s+negra\b/.test(nombre)
  ) {
    return 0;
  }
  if (
    /\bpicos?\b/.test(consultaNormalizada) &&
    /\b(barra|baguette|hogaza|chapata|moscatel|vino|orujo|licor|crema|queso|ginebra|melocoton|fresa|membrillo)\b/.test(
      nombre,
    )
  ) {
    return 0;
  }

  if (
    /\bvinos?\b/.test(consultaNormalizada) &&
    !/\bvinagre\b/.test(consultaNormalizada) &&
    /\bvinagre\b/.test(nombre)
  ) {
    return 0;
  }

  return mejor;
}
