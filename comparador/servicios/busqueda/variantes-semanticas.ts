const VARIANTES_POR_TERMINO: Record<string, string[]> = {
  detergente: [
    "oxy",
    "quitamanchas",
    "blanqueador",
    "suavizante",
    "capsulas lavado",
    "gel lavadora",
    "polvo lavadora",
  ],
  gula: ["angula", "angulas"],
};

function singularizar(termino: string) {
  if (termino.length > 4 && termino.endsWith("es")) {
    return termino.slice(0, -2);
  }
  if (termino.length > 3 && termino.endsWith("s")) {
    return termino.slice(0, -1);
  }
  return termino;
}

export function obtenerVariantesSemanticas(termino: string): string[] {
  const normalizado = termino.trim().toLocaleLowerCase("es");
  return VARIANTES_POR_TERMINO[normalizado] ??
    VARIANTES_POR_TERMINO[singularizar(normalizado)] ??
    [];
}
