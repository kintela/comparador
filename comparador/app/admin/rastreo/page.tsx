import Link from "next/link";

import { PanelRastreoEroski } from "./panel-rastreo-eroski";

export default function PaginaRastreoAdmin() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/rastreos" className="text-sm text-slate-400 hover:text-white">
          ← Volver a rastreadores
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rastreo manual de Eroski
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Previsualiza un lote y, cuando lo hayas revisado, guarda los productos y
            sus precios en Supabase. Esta misma operación podrá ejecutarse más adelante
            desde un cron.
          </p>
        </div>

        <PanelRastreoEroski />
      </div>
    </main>
  );
}
