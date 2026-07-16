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
  verduras: "Verduras y hortalizas",
  fruta: "Frutas",
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
  return CATEGORIAS_POR_BUSQUEDA[crearSlug(consulta).replaceAll("-", " ")] ?? null;
}
