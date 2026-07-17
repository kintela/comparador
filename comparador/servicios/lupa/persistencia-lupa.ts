import "server-only";

import {
  guardarRastreoBm,
  type ResumenPersistenciaBm,
} from "@/servicios/bm/persistencia-bm";

import type { ErrorRastreoLupa, ProductoLupa } from "./tipos-lupa";

export function guardarRastreoLupa({
  productos,
  consultas,
  errores,
}: {
  productos: ProductoLupa[];
  consultas: string[];
  errores: ErrorRastreoLupa[];
}): Promise<ResumenPersistenciaBm> {
  return guardarRastreoBm(
    { productos, consultas, errores },
    {
      slugCadena: "lupa",
      nombreCadena: "Lupa",
      urlCadena: "https://www.lupa.com",
      identificadorTienda: "lupa-online-santander",
      nombreTienda: "Lupa Online · Santander",
      zonaOnline: "Catálogo online de Santander",
      urlCatalogo: "https://www.lupaonline.com/santander/",
      origen: "lupa-online-santander",
      municipio: "Santander",
      provincia: "Cantabria",
    },
  );
}
