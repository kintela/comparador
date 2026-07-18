import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import type { ErrorRastreoDia, ProductoDia } from "./tipos-dia";

export function guardarRastreoDia({
  productos,
  consultas,
  errores,
  codigoPostal,
  tipoRastreo = "manual",
}: {
  productos: ProductoDia[];
  consultas: string[];
  errores: ErrorRastreoDia[];
  codigoPostal: string | null;
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  const sufijoPostal = codigoPostal ? ` · ${codigoPostal}` : "";
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "dia",
      nombreCadena: "DIA",
      urlCadena: "https://www.dia.es",
      identificadorTienda: `dia-online-${codigoPostal ?? "referencia"}`,
      nombreTienda: `DIA Online${sufijoPostal}`,
      zonaOnline: codigoPostal
        ? `Catálogo online de referencia · CP ${codigoPostal}`
        : "Catálogo online de referencia",
      urlCatalogo: "https://www.dia.es",
      origen: `dia-online-${codigoPostal ?? "referencia"}`,
      codigoPostal: codigoPostal ?? undefined,
      provincia: "Catálogo online",
    },
  );
}
