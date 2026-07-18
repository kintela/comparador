import Link from "next/link";

import { PanelRastreoAlcampo } from "./panel-rastreo-alcampo";

export default function PaginaRastreoAlcampo() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/rastreos" className="text-sm text-slate-400 hover:text-white">
          ← Volver a rastreadores
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Rastreo manual de Alcampo
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Consulta el catálogo oficial de Alcampo Online. Sin una dirección de
            entrega, los precios corresponden a la región de referencia asignada
            por su web y no a una tienda física concreta.
          </p>
        </div>
        <PanelRastreoAlcampo />
      </div>
    </main>
  );
}
