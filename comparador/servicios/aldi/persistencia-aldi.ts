import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";

import type { ErrorRastreoAldi, ProductoAldi } from "./tipos-aldi";

export function guardarRastreoAldi({
  productos,
  consultas,
  errores,
}: {
  productos: ProductoAldi[];
  consultas: string[];
  errores: ErrorRastreoAldi[];
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores },
    {
      slugCadena: "aldi",
      nombreCadena: "ALDI",
      urlCadena: "https://www.aldi.es",
      identificadorTienda: "aldi-web-peninsula",
      nombreTienda: "ALDI Web · Península",
      zonaOnline: "Catálogo web regional · Península",
      urlCatalogo: "https://www.aldi.es/productos.html",
      origen: "aldi-web-peninsula",
      provincia: "Península",
    },
  );
}
