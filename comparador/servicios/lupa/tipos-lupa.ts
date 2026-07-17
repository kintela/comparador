export type ProductoLupa = {
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

export type ErrorRastreoLupa = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

type DineroLupa = {
  value?: number;
  currency?: string;
};

export type ProductoApiLupa = {
  uid?: string;
  sku?: string;
  name?: string;
  url_key?: string;
  stock_status?: "IN_STOCK" | "OUT_OF_STOCK";
  marca?: number | null;
  special_to_date?: string | null;
  small_image?: {
    url?: string;
  };
  categories?: Array<{
    name?: string;
  }>;
  price_range?: {
    minimum_price?: {
      regular_price?: DineroLupa;
      final_price?: DineroLupa;
      discount?: {
        amount_off?: number;
        percent_off?: number;
      };
    };
  };
};

export type RespuestaProductosLupa = {
  data?: {
    products?: {
      total_count?: number;
      items?: ProductoApiLupa[];
      page_info?: {
        total_pages?: number;
        current_page?: number;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

export type RespuestaMarcasLupa = {
  data?: {
    customAttributeMetadata?: {
      items?: Array<{
        attribute_options?: Array<{
          value?: string;
          label?: string;
        }>;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};
