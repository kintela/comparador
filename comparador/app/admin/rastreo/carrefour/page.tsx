import Link from "next/link";

import { PanelRastreoCarrefour } from "./panel-rastreo-carrefour";

export default function PaginaRastreoCarrefour() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin/rastreos"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Volver a rastreadores
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rastreo manual de Carrefour
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Consulta el catálogo oficial asignado al código postal 48980 y al
            punto de venta 005457, incluyendo EAN, imágenes, disponibilidad y
            precios promocionales.
          </p>
        </div>
        <PanelRastreoCarrefour />
      </div>
    </main>
  );
}
