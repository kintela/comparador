export type ProductoAldi = {
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
  fechaInicioPromocion: string | null;
  fechaFinPromocion: string | null;
  disponible: boolean;
  urlProducto: string;
  urlImagen: string | null;
};

export type ErrorRastreoAldi = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

type PrecioAldi = {
  priceValue?: number;
  strikePrice?: { strikePriceValue?: number };
  basePrice?: Array<{
    basePriceValue?: number;
    basePriceScale?: string;
    basePriceAdditionalInformation?: string;
  }>;
  priceTagLabels?: {
    promoText1?: string;
    promoText2?: string;
    textualAddition?: string;
  };
  validFrom?: number;
  validUntil?: number;
};

export type ProductoApiAldi = {
  objectID: string;
  name: string;
  brandName?: string | null;
  productSlug?: string;
  isAvailable?: boolean;
  isComingSoon?: boolean;
  salesUnit?: string | null;
  mainCategoryID?: string | null;
  currentPrice?: PrecioAldi;
  promotionPrices?: PrecioAldi[] | null;
  assets?: Array<{ type?: string; url?: string }>;
  productReferences?: Array<{ type?: string; value?: string }>;
};

export type RespuestaBusquedaAldi = {
  nbHits?: number;
  hits?: ProductoApiAldi[];
};
