import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";

import type { ErrorRastreoAlcampo, ProductoAlcampo } from "./tipos-alcampo";

export function guardarRastreoAlcampo({
  productos,
  consultas,
  errores,
  regionId,
}: {
  productos: ProductoAlcampo[];
  consultas: string[];
  errores: ErrorRastreoAlcampo[];
  regionId: string | null;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores },
    {
      slugCadena: "alcampo",
      nombreCadena: "Alcampo",
      urlCadena: "https://www.alcampo.es",
      identificadorTienda: `alcampo-online-${regionId ?? "referencia"}`,
      nombreTienda: "Alcampo Online",
      zonaOnline: regionId
        ? `Catálogo online de referencia · región ${regionId}`
        : "Catálogo online de referencia",
      urlCatalogo: "https://www.compraonline.alcampo.es",
      origen: `alcampo-online-${regionId ?? "referencia"}`,
      provincia: "Catálogo online",
    },
  );
}
