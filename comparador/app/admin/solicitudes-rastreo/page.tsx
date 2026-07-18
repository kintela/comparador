import Link from "next/link";

import { PanelSolicitudesRastreo } from "./panel-solicitudes-rastreo";

export default function PaginaSolicitudesRastreo() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-slate-400 hover:text-white">
          ← Volver a administración
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Solicitudes de productos
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Prioriza los productos que los usuarios buscaron y todavía no estaban
            en el catálogo. El rastreo se ejecuta en las cadenas solicitadas y
            guarda automáticamente los resultados.
          </p>
        </div>
        <PanelSolicitudesRastreo />
      </div>
    </main>
  );
}
