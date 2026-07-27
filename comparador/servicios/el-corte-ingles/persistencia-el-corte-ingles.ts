import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";
import type { TipoRastreo } from "@/servicios/rastreo/configuracion";

import type {
  ErrorRastreoElCorteIngles,
  ProductoElCorteIngles,
} from "./tipos-el-corte-ingles";

export function guardarRastreoElCorteIngles({
  productos,
  consultas,
  errores,
  centroEntrega,
  tipoRastreo = "manual",
}: {
  productos: ProductoElCorteIngles[];
  consultas: string[];
  errores: ErrorRastreoElCorteIngles[];
  centroEntrega: string;
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores, tipoRastreo },
    {
      slugCadena: "el-corte-ingles",
      nombreCadena: "El Corte Inglés",
      urlCadena: "https://www.elcorteingles.es",
      identificadorTienda: `el-corte-ingles-online-${centroEntrega}`,
      nombreTienda: "Supermercado El Corte Inglés Online",
      zonaOnline: `Catálogo online de referencia · centro de entrega ${centroEntrega}`,
      urlCatalogo: "https://www.elcorteingles.es/supermercado/",
      origen: `el-corte-ingles-online-${centroEntrega}`,
      provincia: "Catálogo online",
    },
  );
}
