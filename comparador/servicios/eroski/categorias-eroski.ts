const CATEGORIAS_POR_BUSQUEDA: Record<string, string> = {
  leche: "Leche y bebidas lácteas",
  huevos: "Huevos",
  pan: "Panadería",
  arroz: "Arroz",
  pasta: "Pasta",
  aceite: "Aceites",
  harina: "Harinas y repostería",
  azucar: "Azúcar y edulcorantes",
  cafe: "Café e infusiones",
  agua: "Agua y bebidas",
  yogur: "Yogures y postres",
  queso: "Quesos",
  mantequilla: "Mantequillas y margarinas",
  pollo: "Pollo y aves",
  carne: "Carne",
  pescado: "Pescado y marisco",
  gula: "Pescado y marisco",
  verduras: "Verduras y hortalizas",
  fruta: "Frutas",
  mandarina: "Frutas",
  naranja: "Frutas",
  manzana: "Frutas",
  pera: "Frutas",
  platano: "Frutas",
  melon: "Frutas",
  sandia: "Frutas",
  kiwi: "Frutas",
  limon: "Frutas",
  fresa: "Frutas",
  legumbres: "Legumbres",
  conservas: "Conservas",
  cereales: "Cereales",
  galletas: "Galletas y dulces",
  "papel higienico": "Papel e higiene del hogar",
  detergente: "Limpieza de la ropa",
  champu: "Cuidado del cabello",
};

export function crearSlug(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function obtenerCategoriaSugerida(consulta: string): string | null {
  const termino = crearSlug(consulta).replaceAll("-", " ");
  const directa = CATEGORIAS_POR_BUSQUEDA[termino];
  if (directa) return directa;

  const palabras = termino.split(" ");
  const ultima = palabras.at(-1);
  if (!ultima) return null;
  const candidatas = [
    ultima.length > 4 && ultima.endsWith("es") ? ultima.slice(0, -2) : "",
    ultima.length > 3 && ultima.endsWith("s") ? ultima.slice(0, -1) : "",
  ];
  for (const candidata of candidatas) {
    if (!candidata) continue;
    const singular = [...palabras.slice(0, -1), candidata].join(" ");
    if (CATEGORIAS_POR_BUSQUEDA[singular]) {
      return CATEGORIAS_POR_BUSQUEDA[singular];
    }
  }
  return null;
}
