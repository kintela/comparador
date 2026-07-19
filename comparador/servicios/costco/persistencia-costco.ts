import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import {
  CODIGO_POSTAL_COSTCO,
  COSTCO_RETAILER_LOCATION_ID,
} from "./cliente-costco";
import type { ErrorRastreoCostco, ProductoCostco } from "./tipos-costco";

export function guardarRastreoCostco({
  productos,
  consultas,
  errores,
  tipoRastreo = "manual",
}: {
  productos: ProductoCostco[];
  consultas: string[];
  errores: ErrorRastreoCostco[];
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "costco",
      nombreCadena: "Costco",
      urlCadena: "https://www.costco.es",
      identificadorTienda: `costco-${COSTCO_RETAILER_LOCATION_ID}`,
      nombreTienda: "Costco - Bilbao",
      zonaOnline: `Same-Day · almacén ${COSTCO_RETAILER_LOCATION_ID}`,
      urlCatalogo: "https://sameday.costco.es/store/costco-espana/storefront",
      origen: `costco-${COSTCO_RETAILER_LOCATION_ID}`,
      codigoPostal: CODIGO_POSTAL_COSTCO,
      municipio: "Sestao",
      provincia: "Bizkaia",
    },
  );
}
