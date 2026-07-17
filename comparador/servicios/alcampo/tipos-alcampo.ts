export type ProductoAlcampo = {
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

export type ErrorRastreoAlcampo = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

type DineroAlcampo = {
  amount?: string;
  currency?: string;
};

type OfertaAlcampo = {
  description?: string;
  retailerPromotionId?: string;
  type?: string;
};

export type ProductoApiAlcampo = {
  productId?: string;
  retailerProductId?: string;
  brand?: string;
  available?: boolean;
  isInCurrentCatalog?: boolean;
  name?: string;
  categoryPath?: string[];
  price?: {
    current?: DineroAlcampo;
    previous?: DineroAlcampo;
    original?: DineroAlcampo;
    unit?: {
      label?: string;
      current?: DineroAlcampo;
    };
  };
  image?: {
    src?: string;
  };
  offer?: OfertaAlcampo;
  offers?: OfertaAlcampo[];
};

export type EstadoInicialAlcampo = {
  data?: {
    basket?: {
      regionId?: string | null;
      defaultCheckout?: {
        shippingGroupTypeDisplayName?: string;
      };
    };
    products?: {
      productEntities?: Record<string, ProductoApiAlcampo>;
    };
    search?: {
      catalogue?: {
        data?: {
          totalProducts?: number;
          query?: {
            searchTerm?: string;
          };
          productGroups?: Array<{
            products?: string[];
          }>;
        };
      };
    };
  };
};
