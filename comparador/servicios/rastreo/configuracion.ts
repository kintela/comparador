export const CONSULTAS_RASTREO_HABITUALES = [
  "leche",
  "huevos",
  "pan",
  "arroz",
  "pasta",
  "aceite",
  "harina",
  "azucar",
  "cafe",
  "agua",
  "yogur",
  "queso",
  "mantequilla",
  "pollo",
  "carne",
  "pescado",
  "verduras",
  "fruta",
  "legumbres",
  "conservas",
  "cereales",
  "galletas",
  "papel higiénico",
  "detergente",
  "champú",
] as const;

export const CONSULTAS_RASTREO_TEXTO =
  CONSULTAS_RASTREO_HABITUALES.join("\n");

export const CONFIGURACION_RASTREO_AUTOMATICO = {
  consultas: [...CONSULTAS_RASTREO_HABITUALES],
  resultadosPorConsulta: 10,
  paginasEroskiPorConsulta: 1,
  maxProductos: 250,
  codigoPostalMercadona: "48980",
};

export type TipoRastreo = "manual" | "automatico";
