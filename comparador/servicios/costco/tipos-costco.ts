export type ProductoCostco = {
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

export type ErrorRastreoCostco = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

export type ImagenCostcoApi = {
  url?: string | null;
};

export type ProductoCostcoApi = {
  __typename?: string;
  id?: string;
  productId?: string;
  evergreenUrl?: string;
  name?: string;
  brandName?: string | null;
  size?: string | null;
  availability?: {
    available?: boolean;
    stockLevel?: string | null;
  } | null;
  productCanonicalUrl?: {
    canonicalUrl?: string | null;
  } | null;
  price?: {
    viewSection?: {
      fullPriceString?: string | null;
      priceValueString?: string | null;
      itemPromotions?: unknown[];
      secondaryPromotion?: unknown;
      itemCard?: {
        pricingUnitString?: string | null;
        fullPriceString?: string | null;
        discountHeaderString?: string | null;
      } | null;
      itemDetails?: {
        pricePerUnitString?: string | null;
        pricingUnitString?: string | null;
        fullPriceString?: string | null;
      } | null;
    } | null;
  } | null;
  viewSection?: {
    itemImage?: ImagenCostcoApi | null;
    itemTransparentImage?: ImagenCostcoApi | null;
    retailerReferenceCodeString?: string | null;
    trackingProperties?: {
      product_category_name?: string | null;
      on_sale_ind?: {
        on_sale?: boolean;
        retailer?: boolean;
        cpg_coupon?: boolean;
        buy_one_get_one?: boolean;
      } | null;
    } | null;
  } | null;
};

export type RespuestaBusquedaCostco = {
  data?: {
    searchResultsPlacements?: {
      placements?: Array<{
        content?: {
          itemIds?: string[];
        } | null;
      }>;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export type RespuestaProductosCostco = {
  data?: {
    items?: ProductoCostcoApi[];
  };
  errors?: Array<{ message?: string }>;
};
