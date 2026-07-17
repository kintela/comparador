export type ProductoDia = {
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

export type ErrorRastreoDia = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

export type PrecioApiDia = {
  currency?: string;
  discount_percentage?: number;
  is_club_price?: boolean;
  is_promo_price?: boolean;
  measure_unit?: string;
  price?: number;
  price_per_unit?: number;
  strikethrough_price?: number;
};

export type ProductoApiDia = {
  brand?: string | null;
  display_name?: string;
  image?: string | null;
  l1_category_description?: string | null;
  l2_category_description?: string | null;
  object_id?: string;
  prices?: PrecioApiDia;
  sku_id?: string;
  stamp_description?: string | null;
  units_in_stock?: number;
  url?: string | null;
};

export type RespuestaBusquedaDia = {
  cart?: {
    postal_code?: string;
  };
  total_items?: number;
  search_items?: ProductoApiDia[];
  pagination?: {
    page_number?: number;
    page_size?: number;
    total_pages?: number;
  };
};
