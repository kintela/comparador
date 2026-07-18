"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, type FormEvent } from "react";

type Cadena = {
  id: string;
  nombre: string;
  slug: string;
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
  estadisticas: {
    productosCatalogados: number;
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

export function PanelCatalogo() {
  const [datos, setDatos] = useState<DatosCatalogo | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [supermercado, setSupermercado] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Productos del catálogo público
            </p>
            <p className="mt-2 text-3xl font-bold text-white">
              {datos.estadisticas.productosCatalogados}
            </p>
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
