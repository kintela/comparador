export type ProductoBm = {
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

export type ErrorRastreoBm = {
  consulta: string;
  pagina: number;
  mensaje: string;
};

export type RespuestaCatalogoBm = {
  totalCount: number;
  hasMore: boolean;
  products?: ProductoApiBm[];
};

export type ProductoApiBm = {
  code: string;
  ean?: string;
  productData: {
    name: string;
    brand?: { name?: string };
    url: string;
    imageURL?: string;
    availability?: string;
    temporaryOutOfStock?: boolean;
  };
  priceData: {
    prices?: Array<{
      id: string;
      value?: {
        centAmount?: number;
        centUnitAmount?: number;
      };
    }>;
    unitPriceUnitType?: string;
  };
  categories?: Array<{ name?: string }>;
  offers?: Array<{
    from?: string;
    to?: string;
    shortDescription?: string;
  }>;
};
