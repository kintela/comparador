import Link from "next/link";

import { PanelRastreoCoviran } from "./panel-rastreo-coviran";

export default function PaginaRastreoCoviran() {
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
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rastreo manual de Covirán
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Extrae las ofertas del folleto oficial para País Vasco. Son precios
            regionales sujetos a vigencia y a establecimientos adheridos, no el
            catálogo completo de una tienda concreta de Santurtzi.
          </p>
        </div>
        <PanelRastreoCoviran />
      </div>
    </main>
  );
}
