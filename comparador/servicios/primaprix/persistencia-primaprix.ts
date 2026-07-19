import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import type {
  ErrorRastreoPrimaprix,
  ProductoPrimaprix,
} from "./tipos-primaprix";

export function guardarRastreoPrimaprix({
  productos,
  consultas,
  errores,
  tipoRastreo = "manual",
}: {
  productos: ProductoPrimaprix[];
  consultas: string[];
  errores: ErrorRastreoPrimaprix[];
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "primaprix",
      nombreCadena: "Primaprix",
      urlCadena: "https://primaprix.eu/es/",
      identificadorTienda: "primaprix-catalogo-web-santurtzi",
      nombreTienda: "Primaprix · catálogo web",
      zonaOnline: "Catálogo web · tienda de referencia Santurtzi",
      urlCatalogo: "https://primaprix.eu/es/catalogo/",
      origen: "primaprix-catalogo-web",
      codigoPostal: "48980",
      municipio: "Santurtzi",
      provincia: "Bizkaia",
    },
  );
}
