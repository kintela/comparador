import Link from "next/link";

const AREAS = [
  {
    nombre: "Rastreos",
    descripcion:
      "Ejecuta, revisa y controla los rastreadores de cada supermercado y las solicitudes pendientes.",
    href: "/admin/rastreos",
    color: "border-emerald-500/40 hover:border-emerald-400",
    etiqueta: "Operaciones",
  },
  {
    nombre: "Catálogo de productos",
    descripcion:
      "Consulta los productos catalogados, su cobertura por supermercado y gestiona los términos automáticos.",
    href: "/admin/catalogo",
    color: "border-cyan-500/40 hover:border-cyan-400",
    etiqueta: "Contenido",
  },
];

export default function PaginaAdmin() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-16 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
          Comparador · Administración
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">
          Panel de administración
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Separa la operación de los rastreadores de la gestión del catálogo que
          alimenta el comparador.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {AREAS.map((area) => (
            <Link
              key={area.nombre}
              href={area.href}
              className={`group rounded-2xl border bg-slate-900 p-8 transition ${area.color}`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {area.etiqueta}
              </p>
              <h2 className="mt-3 text-3xl font-bold">{area.nombre}</h2>
              <p className="mt-4 leading-7 text-slate-400">{area.descripcion}</p>
              <p className="mt-8 text-sm font-bold text-slate-200 transition group-hover:text-white">
                Abrir área →
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
