import Link from "next/link";

import { PanelSolicitudesRastreo } from "./panel-solicitudes-rastreo";

export default function PaginaSolicitudesRastreo() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/rastreos" className="text-sm text-slate-400 hover:text-white">
          ← Volver a rastreos
        </Link>
        <div className="mb-8 mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Comparador · Administración
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Solicitudes de productos
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Prioriza los productos que no tienen precio en alguna de las cadenas
            consultadas. Cada tarjeta muestra únicamente los supermercados cuya
            cobertura sigue pendiente.
          </p>
        </div>
        <PanelSolicitudesRastreo />
      </div>
    </main>
  );
}
