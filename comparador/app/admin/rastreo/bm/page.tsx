import Link from "next/link";

import { PanelRastreoBm } from "./panel-rastreo-bm";

export default function PaginaRastreoBm() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-slate-400 hover:text-white">
          ← Volver a rastreadores
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-yellow-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rastreo manual de BM
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Usa las mismas búsquedas de Eroski y guarda precios, promociones y EAN
            del catálogo general de BM Online.
          </p>
        </div>
        <PanelRastreoBm />
      </div>
    </main>
  );
}
