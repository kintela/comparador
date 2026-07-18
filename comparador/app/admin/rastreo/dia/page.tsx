import Link from "next/link";

import { PanelRastreoDia } from "./panel-rastreo-dia";

export default function PaginaRastreoDia() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/rastreos" className="text-sm text-slate-400 hover:text-white">
          ← Volver a rastreadores
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-red-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rastreo manual de DIA
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Consulta el catálogo oficial de DIA Online. El código postal mostrado
            en los resultados identifica la zona de referencia que DIA asigna a
            las búsquedas sin sesión.
          </p>
        </div>
        <PanelRastreoDia />
      </div>
    </main>
  );
}
