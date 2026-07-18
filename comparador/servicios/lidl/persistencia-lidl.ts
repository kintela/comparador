import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import type { ErrorRastreoLidl, ProductoLidl } from "./tipos-lidl";

export function guardarRastreoLidl({
  productos,
  consultas,
  errores,
  tipoRastreo = "manual",
}: {
  productos: ProductoLidl[];
  consultas: string[];
  errores: ErrorRastreoLidl[];
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "lidl",
      nombreCadena: "Lidl",
      urlCadena: "https://www.lidl.es",
      identificadorTienda: "lidl-web-vizcaya",
      nombreTienda: "Lidl Web · Vizcaya",
      zonaOnline: "Catálogo web regional · Vizcaya",
      urlCatalogo: "https://www.lidl.es/c/alimentacion/s10068374",
      origen: "lidl-web-vizcaya",
      municipio: "Santurtzi",
      provincia: "Bizkaia",
    },
  );
}
