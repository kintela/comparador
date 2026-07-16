export type ProductoEroski = {
  identificadorExterno: string;
  nombreOriginal: string;
  precio: number;
  moneda: "EUR";
  urlProducto: string;
  urlImagen: string | null;
  disponible: boolean;
  marcaOriginal: string | null;
  categoriaSugerida?: string | null;
};

export type ResultadoRastreoEroski = {
  consulta: string;
  urlOrigen: string;
  fechaObtencion: string;
  totalDeclarado: number | null;
  productos: ProductoEroski[];
};

export type ItemMetricasEroski = {
  price?: number | string;
  item_id?: string | number;
  item_name?: string;
  item_brand?: string;
};

export type MetricasProductoEroski = {
  ecommerce?: {
    items?: ItemMetricasEroski[];
  };
};
