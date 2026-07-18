export type ProductoCoviran = {
  identificadorExterno: string;
  ean: string | null;
  nombreOriginal: string;
  marcaOriginal: string | null;
  categoriaOriginal: string | null;
  categoriaSugerida: string | null;
  precio: number;
  precioPromocional: number | null;
  precioReferencia: number | null;
  unidadReferencia: string | null;
  textoPromocion: string | null;
  fechaInicioPromocion: string | null;
  fechaFinPromocion: string | null;
  disponible: boolean;
  urlProducto: string;
  urlImagen: string | null;
};

export type ErrorRastreoCoviran = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

export type CatalogoCoviran = {
  productos: ProductoCoviran[];
  fechaInicio: string;
  fechaFin: string;
  tituloVigencia: string;
};
