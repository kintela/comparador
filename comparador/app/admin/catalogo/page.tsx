import Link from "next/link";

import { PanelCatalogo } from "./panel-catalogo";

export default function PaginaCatalogoAdmin() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-slate-400 hover:text-white">
          ← Volver a administración
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Catálogo de productos
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Consulta qué productos están catalogados, en qué supermercados se
            detectan y amplía los términos que utilizarán los próximos rastreos
            automáticos.
          </p>
        </div>

        <PanelCatalogo />
      </div>
    </main>
  );
}
