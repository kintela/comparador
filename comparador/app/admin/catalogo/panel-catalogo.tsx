"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, type FormEvent } from "react";

const SUPERMERCADOS_TERMINOS = [
  { slug: "eroski", nombre: "Eroski" },
  { slug: "bm", nombre: "BM" },
  { slug: "mercadona", nombre: "Mercadona" },
  { slug: "aldi", nombre: "ALDI" },
  { slug: "dia", nombre: "DIA" },
  { slug: "lidl", nombre: "Lidl" },
  { slug: "alcampo", nombre: "Alcampo" },
  { slug: "lupa", nombre: "Lupa" },
] as const;

type Cadena = {
  id: string;
  nombre: string;
  slug: string;
};

type TerminoRastreo = {
  id: string;
  termino: string;
  termino_normalizado: string;
  supermercados: string[];
  prioridad: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

type ReferenciaProducto = {
  id: string;
  activo: boolean;
  fecha_ultima_deteccion: string;
  cadenas_supermercados: {
    nombre: string;
    slug: string;
  } | null;
};

type ProductoCatalogo = {
  id: string;
  nombre: string;
  codigo_ean: string | null;
  url_imagen: string | null;
  activo: boolean;
  fecha_actualizacion: string;
  marcas: { nombre: string } | null;
  categorias: { nombre: string } | null;
  productos_supermercado: ReferenciaProducto[];
};

type DatosCatalogo = {
  ok: boolean;
  error?: string;
  cadenas: Cadena[];
  terminos: TerminoRastreo[];
  estadisticas: {
    productosCatalogados: number;
    referenciasSupermercado: number;
    productosSinPrecio: number;
    terminosActivos: number;
  };
  productos: ProductoCatalogo[];
  paginacion: {
    pagina: number;
    porPagina: number;
    total: number;
    totalPaginas: number;
  };
};

function fechaLegible(fecha: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(fecha));
}

function supermercadosDelTermino(termino: TerminoRastreo) {
  if (termino.supermercados.length === 0) return "Todos los supermercados";
  return termino.supermercados
    .map(
      (slug) =>
        SUPERMERCADOS_TERMINOS.find((supermercado) => supermercado.slug === slug)
          ?.nombre ?? slug,
    )
    .join(", ");
}

export function PanelCatalogo() {
  const [datos, setDatos] = useState<DatosCatalogo | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [supermercado, setSupermercado] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoTermino, setNuevoTermino] = useState("");
  const [supermercadosNuevoTermino, setSupermercadosNuevoTermino] = useState<
    string[]
  >([]);
  const [guardandoTermino, setGuardandoTermino] = useState(false);

  async function cargarCatalogo(pagina = 1) {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ pagina: String(pagina) });
      if (busqueda.trim()) parametros.set("q", busqueda.trim());
      if (supermercado) parametros.set("supermercado", supermercado);
      const respuesta = await fetch(`/api/admin/catalogo?${parametros}`, {
        cache: "no-store",
      });
      const resultado = (await respuesta.json()) as DatosCatalogo;
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(resultado.error ?? "No se pudo cargar el catálogo");
      }
      setDatos(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    await cargarCatalogo(1);
  }

  async function guardarTermino(evento: FormEvent) {
    evento.preventDefault();
    if (!nuevoTermino.trim()) return;

    setGuardandoTermino(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/admin/catalogo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          termino: nuevoTermino.trim(),
          supermercados: supermercadosNuevoTermino,
        }),
      });
      const resultado = (await respuesta.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(resultado.error ?? "No se pudo guardar el término");
      }
      setNuevoTermino("");
      setSupermercadosNuevoTermino([]);
      await cargarCatalogo(datos?.paginacion.pagina ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardandoTermino(false);
    }
  }

  async function cambiarEstadoTermino(termino: TerminoRastreo) {
    setError(null);
    try {
      const respuesta = await fetch("/api/admin/catalogo", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: termino.id, activo: !termino.activo }),
      });
      const resultado = (await respuesta.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(resultado.error ?? "No se pudo actualizar el término");
      }
      await cargarCatalogo(datos?.paginacion.pagina ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function alternarSupermercado(slug: string) {
    setSupermercadosNuevoTermino((actuales) =>
      actuales.includes(slug)
        ? actuales.filter((item) => item !== slug)
        : [...actuales, slug],
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-white">Sesión de administración activa</p>
            <p className="mt-1 text-sm text-slate-400">
              Abre o actualiza el catálogo con la sesión actual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void cargarCatalogo(1)}
            disabled={cargando}
            className="rounded-lg bg-cyan-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-60"
          >
            {cargando ? "Cargando…" : datos ? "Actualizar" : "Abrir catálogo"}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/50 bg-red-950/40 px-5 py-4 text-red-200">
          {error}
        </div>
      ) : null}

      {datos ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Productos catalogados", datos.estadisticas.productosCatalogados],
              [
                "Referencias detectadas",
                datos.estadisticas.referenciasSupermercado,
              ],
              [
                "Productos sin precio",
                datos.estadisticas.productosSinPrecio,
              ],
              ["Términos activos", datos.estadisticas.terminosActivos],
            ].map(([etiqueta, valor]) => (
              <div
                key={etiqueta}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {etiqueta}
                </p>
                <p className="mt-2 text-3xl font-bold text-white">{valor}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
                  Lista automática
                </p>
                <h2 className="mt-2 text-2xl font-bold">Términos rastreados</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Los términos nuevos reciben prioridad y entran al principio del
                  próximo rastreo. Un término sin supermercados seleccionados se
                  utiliza en todos.
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-xs leading-5 text-amber-200">
                Cada supermercado procesa todos los términos aplicables en cada
                ejecución automática.
              </div>
            </div>

            <form
              onSubmit={guardarTermino}
              className="mt-6 rounded-xl border border-slate-700 bg-slate-950/60 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row">
                <input
                  value={nuevoTermino}
                  onChange={(evento) => setNuevoTermino(evento.target.value)}
                  placeholder="Nuevo producto o familia, por ejemplo: chocolate"
                  maxLength={60}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={guardandoTermino || nuevoTermino.trim().length < 2}
                  className="rounded-lg bg-cyan-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-50"
                >
                  {guardandoTermino ? "Añadiendo…" : "Añadir al rastreo"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="py-2 text-xs text-slate-500">
                  Limitar a:
                </span>
                {SUPERMERCADOS_TERMINOS.map((item) => (
                  <label
                    key={item.slug}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-xs ${
                      supermercadosNuevoTermino.includes(item.slug)
                        ? "border-cyan-400 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-700 text-slate-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={supermercadosNuevoTermino.includes(item.slug)}
                      onChange={() => alternarSupermercado(item.slug)}
                      className="sr-only"
                    />
                    {item.nombre}
                  </label>
                ))}
                {supermercadosNuevoTermino.length === 0 ? (
                  <span className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    Todos
                  </span>
                ) : null}
              </div>
            </form>

            <div className="mt-5 flex flex-wrap gap-2">
              {datos.terminos.map((termino) => (
                <button
                  key={termino.id}
                  type="button"
                  onClick={() => void cambiarEstadoTermino(termino)}
                  title={`${supermercadosDelTermino(termino)} · Pulsa para ${
                    termino.activo ? "desactivar" : "activar"
                  }`}
                  className={`rounded-full border px-3 py-2 text-sm transition ${
                    termino.activo
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-red-400"
                      : "border-slate-700 bg-slate-950 text-slate-500 line-through hover:border-emerald-400"
                  }`}
                >
                  {termino.termino}
                  {termino.supermercados.length > 0 ? (
                    <span className="ml-2 text-[10px] uppercase opacity-60">
                      {termino.supermercados.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">
                Base de datos
              </p>
              <h2 className="mt-2 text-2xl font-bold">Productos catalogados</h2>
            </div>

            <form
              onSubmit={buscar}
              className="mt-5 grid gap-3 md:grid-cols-[1fr_240px_auto]"
            >
              <input
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar por nombre de producto"
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400"
              />
              <select
                value={supermercado}
                onChange={(evento) => setSupermercado(evento.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400"
              >
                <option value="">Todos los supermercados</option>
                {datos.cadenas.map((cadena) => (
                  <option key={cadena.id} value={cadena.slug}>
                    {cadena.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={cargando}
                className="rounded-lg bg-emerald-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-60"
              >
                Buscar
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-400">
              <span>{datos.paginacion.total} productos encontrados</span>
              <span>
                Página {datos.paginacion.pagina} de{" "}
                {Math.max(datos.paginacion.totalPaginas, 1)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {datos.productos.map((producto) => {
                const cadenas = [
                  ...new Map(
                    producto.productos_supermercado
                      .filter((referencia) => referencia.cadenas_supermercados)
                      .map((referencia) => [
                        referencia.cadenas_supermercados!.slug,
                        referencia.cadenas_supermercados!,
                      ]),
                  ).values(),
                ];
                const ultimaDeteccion = producto.productos_supermercado
                  .map((referencia) => referencia.fecha_ultima_deteccion)
                  .sort()
                  .at(-1);

                return (
                  <article
                    key={producto.id}
                    className="flex gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {producto.url_imagen ? (
                        <img
                          src={producto.url_imagen}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-600">
                          Sin imagen
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-5 text-slate-100">
                          {producto.nombre}
                        </h3>
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            producto.activo ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                          title={producto.activo ? "Activo" : "Inactivo"}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {producto.marcas?.nombre ?? "Sin marca"} ·{" "}
                        {producto.categorias?.nombre ?? "Sin categoría"}
                      </p>
                      {producto.codigo_ean ? (
                        <p className="mt-1 text-xs text-slate-600">
                          EAN {producto.codigo_ean}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cadenas.length > 0 ? (
                          cadenas.map((cadena) => (
                            <span
                              key={cadena.slug}
                              className="rounded-md bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200"
                            >
                              {cadena.nombre}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
                            Sin supermercado vinculado
                          </span>
                        )}
                      </div>
                      {ultimaDeteccion ? (
                        <p className="mt-3 text-[11px] text-slate-600">
                          Última detección: {fechaLegible(ultimaDeteccion)}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            {datos.productos.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-700 px-5 py-12 text-center text-slate-500">
                No hay productos que coincidan con estos filtros.
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={cargando || datos.paginacion.pagina <= 1}
                onClick={() =>
                  void cargarCatalogo(datos.paginacion.pagina - 1)
                }
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                type="button"
                disabled={
                  cargando ||
                  datos.paginacion.pagina >= datos.paginacion.totalPaginas
                }
                onClick={() =>
                  void cargarCatalogo(datos.paginacion.pagina + 1)
                }
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
