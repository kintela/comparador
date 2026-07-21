export type ProductoMercadona = {
  identificadorExterno: string;
  ean: null;
  nombreOriginal: string;
  marcaOriginal: string | null;
  categoriaOriginal: string | null;
  categoriaSugerida: string | null;
  precio: number;
  precioPromocional: number | null;
  precioReferencia: number | null;
  unidadReferencia: string | null;
  textoPromocion: string | null;
  fechaInicioPromocion: null;
  fechaFinPromocion: null;
  disponible: boolean;
  urlProducto: string;
  urlImagen: string | null;
};

export type ErrorRastreoMercadona = {
  consulta: string;
  categoriaId?: number;
  mensaje: string;
};

export type CategoriaMercadona = {
  id: number;
  name: string;
  categories?: CategoriaMercadona[];
  products?: ProductoApiMercadona[];
};

export type RespuestaCategoriasMercadona = {
  results?: CategoriaMercadona[];
};

export type ProductoApiMercadona = {
  id: string;
  display_name: string;
  slug?: string | null;
  packaging?: string | null;
  brand?: string | null;
  published?: boolean;
  status?: string | null;
  share_url?: string;
  thumbnail?: string | null;
  categories?: Array<{
    id: number;
    name: string;
    level: number;
    categories?: ProductoApiMercadona["categories"];
  }>;
  price_instructions?: {
    unit_size?: number | null;
    size_format?: string | null;
    unit_price?: string | null;
    bulk_price?: string | null;
    reference_price?: string | null;
    reference_format?: string | null;
    price_decreased?: boolean;
    previous_unit_price?: string | null;
  };
};

export type ZonaMercadona = {
  codigoPostal: string;
  almacen: string;
};
