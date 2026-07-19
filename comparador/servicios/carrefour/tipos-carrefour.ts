export type ProductoCarrefour = {
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

export type ErrorRastreoCarrefour = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

export type ProductoApiCarrefour = {
  product_id?: string;
  ean13?: string;
  display_name?: string;
  brand?: string;
  active_price?: number;
  list_price?: number;
  unit_conversion_factor?: number;
  measure_unit?: string;
  unit_short_name?: string;
  sale_point_available?: boolean;
  active_food?: boolean;
  logistic_analytics?: string;
  image_for_play_service?: string;
  image_path?: {
    food?: string;
  };
  url_for_play_service?: string;
  urls?: {
    food?: string;
  };
};

export type RespuestaApiCarrefour = {
  catalog?: {
    content?: ProductoApiCarrefour[];
    numFound?: number;
    pagination?: {
      start?: number;
      total?: number;
      rows?: number;
    };
  };
};
