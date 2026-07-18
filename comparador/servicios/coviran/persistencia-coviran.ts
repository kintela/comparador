import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import type { ErrorRastreoCoviran, ProductoCoviran } from "./tipos-coviran";

export function guardarRastreoCoviran({
  productos,
  consultas,
  errores,
  tipoRastreo = "manual",
}: {
  productos: ProductoCoviran[];
  consultas: string[];
  errores: ErrorRastreoCoviran[];
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "coviran",
      nombreCadena: "Covirán",
      urlCadena: "https://www.coviran.es",
      identificadorTienda: "coviran-folleto-pais-vasco",
      nombreTienda: "Covirán · Folleto País Vasco",
      zonaOnline: "Precios regionales de folleto · tiendas adheridas",
      urlCatalogo: "https://folleto.coviran.es/paisvasco/index.html",
      origen: "coviran-folleto-pais-vasco",
      provincia: "País Vasco",
    },
  );
}
