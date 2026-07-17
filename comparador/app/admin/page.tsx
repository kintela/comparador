import Link from "next/link";

const RASTREADORES = [
  {
    nombre: "Eroski",
    descripcion: "Catálogo y precios asociados a Eroski City Santurtzi.",
    href: "/admin/rastreo",
    color: "border-emerald-500/40 hover:border-emerald-400",
  },
  {
    nombre: "BM Supermercados",
    descripcion: "Catálogo BM Online general, con EAN y promociones.",
    href: "/admin/rastreo/bm",
    color: "border-yellow-500/40 hover:border-yellow-400",
  },
  {
    nombre: "Mercadona",
    descripcion: "Catálogo asignado al código postal 48980, con precios por zona.",
    href: "/admin/rastreo/mercadona",
    color: "border-emerald-500/40 hover:border-emerald-400",
  },
  {
    nombre: "ALDI",
    descripcion: "Catálogo web de Península y ofertas semanales.",
    href: "/admin/rastreo/aldi",
    color: "border-cyan-500/40 hover:border-cyan-400",
  },
  {
    nombre: "DIA",
    descripcion: "Catálogo oficial DIA Online, stock y promociones.",
    href: "/admin/rastreo/dia",
    color: "border-red-500/40 hover:border-red-400",
  },
  {
    nombre: "Lidl",
    descripcion: "Alimentación y ofertas publicadas para la región Vizcaya.",
    href: "/admin/rastreo/lidl",
    color: "border-blue-500/40 hover:border-blue-400",
  },
  {
    nombre: "Alcampo",
    descripcion: "Catálogo oficial Alcampo Online, precios y ofertas de folleto.",
    href: "/admin/rastreo/alcampo",
    color: "border-orange-500/40 hover:border-orange-400",
  },
  {
    nombre: "Lupa",
    descripcion: "Catálogo oficial Lupa Online para Santander y promociones.",
    href: "/admin/rastreo/lupa",
    color: "border-fuchsia-500/40 hover:border-fuchsia-400",
  },
];

export default function PaginaAdmin() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-16 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
          Comparador · Administración
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Rastreadores</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Selecciona el supermercado que quieres previsualizar o actualizar.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {RASTREADORES.map((rastreador) => (
            <Link
              key={rastreador.nombre}
              href={rastreador.href}
              className={`rounded-2xl border bg-slate-900 p-7 transition ${rastreador.color}`}
            >
              <h2 className="text-2xl font-bold">{rastreador.nombre}</h2>
              <p className="mt-3 leading-7 text-slate-400">{rastreador.descripcion}</p>
              <p className="mt-6 text-sm font-bold text-slate-200">Abrir rastreador →</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
