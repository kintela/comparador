import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import type {
  ErrorRastreoMercadona,
  ProductoMercadona,
  ZonaMercadona,
} from "./tipos-mercadona";

export function guardarRastreoMercadona({
  productos,
  consultas,
  errores,
  zona,
  tipoRastreo = "manual",
}: {
  productos: ProductoMercadona[];
  consultas: string[];
  errores: ErrorRastreoMercadona[];
  zona: ZonaMercadona;
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "mercadona",
      nombreCadena: "Mercadona",
      urlCadena: "https://www.mercadona.es",
      identificadorTienda: `mercadona-online-${zona.codigoPostal}-${zona.almacen}`,
      nombreTienda: `Mercadona Online ${zona.codigoPostal}`,
      zonaOnline: `Código postal ${zona.codigoPostal} · almacén ${zona.almacen}`,
      urlCatalogo: "https://tienda.mercadona.es",
      origen: `mercadona-online-${zona.codigoPostal}-${zona.almacen}`,
      codigoPostal: zona.codigoPostal,
      municipio: "Santurtzi",
      provincia: "Bizkaia",
    },
  );
}
