"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

type Oferta = {
  supermercado: string;
  tienda: string;
  municipio: string | null;
  precio: number;
  precioOriginal: number | null;
  textoPromocion: string | null;
  disponible: boolean;
  fechaObtencion: string;
  urlProducto: string | null;
};

type Producto = {
  id: string;
  nombre: string;
  imagen: string | null;
  marca: string | null;
  categoria: string | null;
  ofertas: Oferta[];
};

type RespuestaBusqueda = {
  ok: boolean;
  consulta?: string;
  total?: number;
  productos?: Producto[];
  error?: string;
};

const BUSQUEDAS_POPULARES = ["leche", "huevos", "pan", "arroz", "aceite"];

export function BuscadorProductos() {
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaBusqueda | null>(null);
  const productosOrdenados = [...(resultado?.productos ?? [])].sort(
    (a, b) =>
      Math.min(...a.ofertas.map((oferta) => oferta.precio)) -
      Math.min(...b.ofertas.map((oferta) => oferta.precio)),
  );

  async function buscar(valor: string) {
    const consultaLimpia = valor.trim();
    if (consultaLimpia.length < 2) return;

    setConsulta(consultaLimpia);
    setBuscando(true);
    setResultado(null);

    try {
      const respuesta = await fetch(
        `/api/productos/buscar?q=${encodeURIComponent(consultaLimpia)}`,
      );
      setResultado((await respuesta.json()) as RespuestaBusqueda);
    } catch {
      setResultado({ ok: false, error: "No se pudo conectar con el buscador" });
    } finally {
      setBuscando(false);
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void buscar(consulta);
  }

  return (
    <div className="mx-auto mt-10 max-w-5xl sm:mt-12">
      <form
        onSubmit={enviar}
        className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-[#17352b]/10 bg-white p-2 shadow-[0_24px_70px_rgba(23,53,43,0.12)] sm:flex-row"
      >
        <label className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5 shrink-0 fill-none stroke-[#6b7f77] stroke-2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <span className="sr-only">Producto</span>
          <input
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
            minLength={2}
            maxLength={80}
            required
            placeholder="¿Qué producto estás buscando?"
            className="h-12 w-full bg-transparent text-base text-[#17352b] outline-none placeholder:text-[#8d9b96]"
          />
        </label>
        <button
          type="submit"
          disabled={buscando}
          className="h-12 rounded-xl bg-[#176b50] px-8 font-bold text-white transition hover:bg-[#125740] disabled:cursor-wait disabled:opacity-60"
        >
          {buscando ? "Buscando…" : "Buscar precios"}
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="mr-1 text-[#71837c]">Búsquedas populares:</span>
        {BUSQUEDAS_POPULARES.map((busqueda) => (
          <button
            type="button"
            key={busqueda}
            onClick={() => void buscar(busqueda)}
            className="rounded-full border border-[#17352b]/15 bg-white/70 px-3 py-1.5 font-medium transition hover:border-[#176b50] hover:text-[#176b50]"
          >
            {busqueda}
          </button>
        ))}
      </div>

      <div className="mt-12" aria-live="polite">
        {buscando && <Cargando />}

        {resultado && !resultado.ok && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-red-700">
            {resultado.error ?? "La búsqueda ha fallado"}
          </div>
        )}

        {resultado?.ok && productosOrdenados.length === 0 && (
          <div className="rounded-3xl border border-[#17352b]/10 bg-white/70 px-6 py-14 text-center">
            <p className="text-xl font-bold">No hemos encontrado ese producto</p>
            <p className="mt-2 text-[#71837c]">Prueba con un término más general.</p>
          </div>
        )}

        {resultado?.ok && productosOrdenados.length > 0 && (
          <div>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#16805e]">Resultados</p>
                <h2 className="mt-1 text-2xl font-bold">
                  {resultado.total} productos para “{resultado.consulta}”
                </h2>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {productosOrdenados.map((producto) => (
                <ProductoCard key={producto.id} producto={producto} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-52 animate-pulse rounded-2xl bg-[#17352b]/8" />
      ))}
    </div>
  );
}

function ProductoCard({ producto }: { producto: Producto }) {
  const ofertas = [...producto.ofertas].sort((a, b) => a.precio - b.precio);

  return (
    <article className="rounded-2xl border border-[#17352b]/10 bg-white p-5 shadow-[0_10px_35px_rgba(23,53,43,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_45px_rgba(23,53,43,0.1)]">
      <div className="flex gap-5">
        <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f7f5ee] sm:h-32 sm:w-28">
          {producto.imagen ? (
            <Image
              src={producto.imagen}
              alt={producto.nombre}
              fill
              sizes="112px"
              className="object-contain p-2"
            />
          ) : (
            <div className="grid h-full place-items-center text-3xl text-[#9eaaa5]">€</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-[#71837c]">
            {producto.marca && <span>{producto.marca}</span>}
            {producto.categoria && <span>· {producto.categoria}</span>}
          </div>
          <h3 className="mt-2 line-clamp-3 font-bold leading-5 text-[#17352b]">
            {producto.nombre}
          </h3>
          <p className="mt-3 text-xs text-[#71837c]">
            {ofertas.length > 1
              ? `${ofertas.length} precios encontrados`
              : "1 precio encontrado"}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2 border-t border-[#17352b]/10 pt-4">
        {ofertas.map((oferta, indice) => (
          <div
            key={`${oferta.supermercado}-${oferta.tienda}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f5ee] px-3 py-3"
          >
          <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[#17352b]">{oferta.supermercado}</p>
                {indice === 0 && ofertas.length > 1 && (
                  <span className="rounded-full bg-[#dff3e9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#176b50]">
                    Mejor precio
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#71837c]">
                {oferta.tienda}
                {oferta.municipio ? ` · ${oferta.municipio}` : ""}
              </p>
              {oferta.textoPromocion && (
                <p className="mt-1 text-xs font-semibold text-[#b06d00]">
                  {oferta.textoPromocion}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-right">
              <div>
                {oferta.precioOriginal && (
                  <p className="text-xs text-[#8b9994] line-through">
                    {oferta.precioOriginal.toLocaleString("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                )}
                <p className="text-xl font-extrabold text-[#176b50]">
                  {oferta.precio.toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                })}
                </p>
              </div>
              {oferta.urlProducto && (
                <a
                  href={oferta.urlProducto}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Ver en ${oferta.supermercado}`}
                  className="grid size-8 place-items-center rounded-lg border border-[#176b50]/25 text-sm font-bold text-[#176b50] transition hover:bg-[#176b50] hover:text-white"
                >
                  ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
