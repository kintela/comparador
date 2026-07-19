import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import {
  CODIGO_POSTAL_CARREFOUR,
  PUNTO_VENTA_CARREFOUR,
} from "./cliente-carrefour";
import type {
  ErrorRastreoCarrefour,
  ProductoCarrefour,
} from "./tipos-carrefour";

export function guardarRastreoCarrefour({
  productos,
  consultas,
  errores,
  tipoRastreo = "manual",
}: {
  productos: ProductoCarrefour[];
  consultas: string[];
  errores: ErrorRastreoCarrefour[];
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "carrefour",
      nombreCadena: "Carrefour",
      urlCadena: "https://www.carrefour.es",
      identificadorTienda: `carrefour-${PUNTO_VENTA_CARREFOUR}`,
      nombreTienda: `Carrefour Online ${CODIGO_POSTAL_CARREFOUR}`,
      zonaOnline: `Punto de venta ${PUNTO_VENTA_CARREFOUR}`,
      urlCatalogo: "https://www.carrefour.es/supermercado/",
      origen: `carrefour-${PUNTO_VENTA_CARREFOUR}`,
      codigoPostal: CODIGO_POSTAL_CARREFOUR,
      municipio: "Santurtzi",
      provincia: "Bizkaia",
    },
  );
}
