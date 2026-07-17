export type ProductoLidl = {
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

export type ErrorRastreoLidl = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

type PrecioLidl = {
  basePrice?: { text?: string };
  discount?: {
    bargainHintText?: string;
    percentageDiscount?: number;
    showDiscount?: boolean;
  };
  oldPrice?: number;
  packaging?: { text?: string };
  price?: number;
  startDate?: string;
  endDate?: string;
};

type PrecioLidlPlus = {
  lidlPlusText?: string;
  price?: PrecioLidl;
};

export type ProductoApiLidl = {
  brand?: {
    name?: string;
    showBrand?: boolean;
  };
  canonicalUrl?: string;
  category?: string;
  erpNumber?: string;
  image?: string;
  keyfacts?: {
    title?: string;
    fullTitle?: string;
    wonCategoryPrimary?: string;
  };
  lidlPlus?: PrecioLidlPlus[];
  price?: PrecioLidl;
  productId?: number;
  regionsV2?: Record<
    string,
    {
      regionName?: string;
      status?: string;
    }
  >;
  stockAvailability?: {
    availabilityIndicator?: number;
  };
  store?: boolean;
  title?: string;
};

export type RespuestaBusquedaLidl = {
  numFound?: number;
  offset?: number;
  fetchsize?: number;
  items?: Array<{
    resultClass?: string;
    gridbox?: {
      data?: ProductoApiLidl;
    };
  }>;
};
