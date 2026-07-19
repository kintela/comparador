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
  enOferta: boolean;
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
  soloOfertas?: boolean;
  supermercados?: string[];
  solicitudRastreo?: {
    registrada: boolean;
    configurada: boolean;
    totalSolicitudes?: number;
    contabilizada?: boolean;
  } | null;
  total?: number;
  productos?: Producto[];
  error?: string;
};

const SUPERMERCADOS = [
  "Alcampo",
  "ALDI",
  "BM Supermercados",
  "Carrefour",
  "Costco",
  "Covirán",
  "DIA",
  "Eroski",
  "Lidl",
  "Lupa",
  "Mercadona",
  "Primaprix",
] as const;
const COLUMNAS_RESULTADOS = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
} as const;

type NumeroColumnas = keyof typeof COLUMNAS_RESULTADOS;

function requiereCargaDirecta(url: string) {
  if (
    url.startsWith("/api/imagenes/coviran") ||
    url.startsWith("/api/imagenes/carrefour")
  ) {
    return true;
  }
  try {
    return new URL(url).hostname === "www.lupaonline.com";
  } catch {
    return false;
  }
}

function obtenerEanImagenCarrefour(url: string | null) {
  if (!url?.startsWith("/api/imagenes/carrefour?")) return null;
  return new URLSearchParams(url.split("?")[1]).get("ean");
}

export function BuscadorProductos() {
  const [consulta, setConsulta] = useState("");
  const [soloOfertas, setSoloOfertas] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaBusqueda | null>(null);
  const [numeroColumnas, setNumeroColumnas] = useState<NumeroColumnas>(3);
  const [supermercadosSeleccionados, setSupermercadosSeleccionados] = useState<
    string[]
  >([...SUPERMERCADOS]);
  const productosOrdenados = [...(resultado?.productos ?? [])].sort(
    (a, b) =>
      Math.min(...a.ofertas.map((oferta) => oferta.precio)) -
      Math.min(...b.ofertas.map((oferta) => oferta.precio)),
  );

  async function buscar(
    valor: string,
    filtrarOfertas = soloOfertas,
    supermercados = supermercadosSeleccionados,
  ) {
    const consultaLimpia = valor.trim();
    if (!filtrarOfertas && consultaLimpia.length < 2) return;
    if (supermercados.length === 0) {
      setResultado({
        ok: true,
        consulta: consultaLimpia,
        soloOfertas: filtrarOfertas,
        supermercados: [],
        total: 0,
        productos: [],
      });
      return;
    }

    setConsulta(consultaLimpia);
    setSoloOfertas(filtrarOfertas);
    setBuscando(true);
    setResultado(null);

    try {
      const parametros = new URLSearchParams();
      if (consultaLimpia) parametros.set("q", consultaLimpia);
      if (filtrarOfertas) parametros.set("ofertas", "1");
      for (const supermercado of supermercados) {
        parametros.append("supermercado", supermercado);
      }
      const respuesta = await fetch(`/api/productos/buscar?${parametros.toString()}`);
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
    <div className="mx-auto mt-10 max-w-6xl sm:mt-12">
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
            required={!soloOfertas}
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

      <div className="mt-4 flex justify-center">
        <label className="flex cursor-pointer items-center gap-3 rounded-full border border-[#d89a22]/30 bg-[#fff8e8] px-4 py-2 text-sm font-semibold text-[#8a5700]">
          <input
            type="checkbox"
            checked={soloOfertas}
            onChange={(evento) => {
              const activo = evento.target.checked;
              setSoloOfertas(activo);
              if (resultado && (consulta.trim().length >= 2 || activo)) {
                void buscar(consulta, activo);
              } else if (!activo && !consulta.trim()) {
                setResultado(null);
              }
            }}
            className="size-4 accent-[#d99100]"
          />
          Solo productos en oferta
        </label>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-[#17352b]/10 bg-white/60 px-4 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#60766e]">
            Filtrar por supermercado
          </p>
          <div className="flex gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                const seleccion = [...SUPERMERCADOS];
                setSupermercadosSeleccionados(seleccion);
                if (resultado) void buscar(consulta, soloOfertas, seleccion);
              }}
              className="text-[#176b50] hover:underline"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              onClick={() => {
                setSupermercadosSeleccionados([]);
                if (resultado) void buscar(consulta, soloOfertas, []);
              }}
              className="text-[#71837c] hover:underline"
            >
              Quitar todos
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          {SUPERMERCADOS.map((supermercado) => {
            const seleccionado =
              supermercadosSeleccionados.includes(supermercado);
            return (
              <label
                key={supermercado}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                  seleccionado
                    ? "border-[#176b50]/35 bg-[#e7f5ee] text-[#176b50]"
                    : "border-[#17352b]/12 bg-white/70 text-[#71837c] hover:border-[#176b50]/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={seleccionado}
                  onChange={(evento) => {
                    const seleccion = evento.target.checked
                      ? [...supermercadosSeleccionados, supermercado]
                      : supermercadosSeleccionados.filter(
                          (item) => item !== supermercado,
                        );
                    setSupermercadosSeleccionados(seleccion);
                    if (resultado) void buscar(consulta, soloOfertas, seleccion);
                  }}
                  className="size-4 accent-[#176b50]"
                />
                {supermercado}
              </label>
            );
          })}
        </div>
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
            <p className="text-xl font-bold">
              {resultado.soloOfertas
                ? "No hemos encontrado ofertas"
                : "No hemos encontrado ese producto"}
            </p>
            <p className="mt-2 text-[#71837c]">
              {supermercadosSeleccionados.length === 0
                ? "Selecciona al menos un supermercado."
                : resultado.solicitudRastreo?.registrada
                  ? resultado.solicitudRastreo.contabilizada
                    ? "Hemos añadido este producto a la cola de rastreo."
                    : "Este producto ya estaba solicitado y continúa en la cola de rastreo."
                : resultado.soloOfertas
                ? "Prueba con otro producto o consulta todas las ofertas."
                : "Prueba con un término más general."}
            </p>
            {resultado.solicitudRastreo?.registrada && (
              <p className="mt-3 text-sm font-semibold text-[#16805e]">
                {resultado.solicitudRastreo.totalSolicitudes ?? 1}{" "}
                {(resultado.solicitudRastreo.totalSolicitudes ?? 1) === 1
                  ? "solicitud registrada"
                  : "solicitudes registradas"}
              </p>
            )}
          </div>
        )}

        {resultado?.ok && productosOrdenados.length > 0 && (
          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#16805e]">Resultados</p>
                <h2 className="mt-1 text-2xl font-bold">
                  {resultado.soloOfertas
                    ? resultado.consulta
                      ? `${resultado.total} productos en oferta para “${resultado.consulta}”`
                      : `${resultado.total} productos en oferta`
                    : `${resultado.total} productos para “${resultado.consulta}”`}
                </h2>
              </div>
              <div
                className="flex items-center gap-1 rounded-xl border border-[#17352b]/10 bg-white p-1 shadow-sm"
                aria-label="Fichas por fila"
              >
                <span
                  className="grid size-9 place-items-center text-[#71837c]"
                  title="Fichas por fila"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5 fill-none stroke-current stroke-2"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                {([3, 4, 5] as const).map((columnas) => (
                  <button
                    key={columnas}
                    type="button"
                    onClick={() => setNumeroColumnas(columnas)}
                    aria-label={`Mostrar ${columnas} fichas por fila`}
                    aria-pressed={numeroColumnas === columnas}
                    className={`grid size-9 place-items-center rounded-lg text-sm font-bold transition ${
                      numeroColumnas === columnas
                        ? "bg-[#176b50] text-white"
                        : "text-[#60766e] hover:bg-[#17352b]/5 hover:text-[#176b50]"
                    }`}
                  >
                    {columnas}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`grid gap-4 sm:grid-cols-2 ${COLUMNAS_RESULTADOS[numeroColumnas]}`}
            >
              {productosOrdenados.map((producto) => (
                <ProductoCard key={producto.id} producto={producto} compacta />
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

function ProductoCard({
  producto,
  compacta = false,
}: {
  producto: Producto;
  compacta?: boolean;
}) {
  const ofertas = [...producto.ofertas].sort((a, b) => a.precio - b.precio);
  const eanImagenCarrefour = obtenerEanImagenCarrefour(producto.imagen);

  return (
    <article
      className={`rounded-2xl border border-[#17352b]/10 bg-white shadow-[0_10px_35px_rgba(23,53,43,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_45px_rgba(23,53,43,0.1)] ${
        compacta ? "p-4" : "p-5"
      }`}
    >
      <div className={compacta ? "block" : "flex gap-5"}>
        <div
          className={
            compacta
              ? "relative h-36 w-full overflow-hidden rounded-xl bg-[#f7f5ee]"
              : "relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f7f5ee] sm:h-32 sm:w-28"
          }
        >
          {producto.imagen ? (
            <>
              <Image
                src={producto.imagen}
                alt={producto.nombre}
                fill
                unoptimized={requiereCargaDirecta(producto.imagen)}
                sizes={compacta ? "(min-width: 1024px) 20vw, 50vw" : "112px"}
                className="object-contain p-2"
              />
              {eanImagenCarrefour && (
                <a
                  href={`https://world.openfoodfacts.org/product/${encodeURIComponent(eanImagenCarrefour)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-1 right-1 rounded bg-white/90 px-1.5 py-0.5 text-[8px] font-medium text-[#71837c] hover:text-[#176b50]"
                >
                  Open Food Facts
                </a>
              )}
            </>
          ) : (
            <div className="grid h-full place-items-center text-3xl text-[#9eaaa5]">€</div>
          )}
        </div>
        <div className={`min-w-0 flex-1 ${compacta ? "mt-4" : ""}`}>
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
            className={`rounded-xl bg-[#f7f5ee] px-3 py-3 ${
              compacta
                ? "flex flex-col items-stretch gap-3"
                : "flex items-center justify-between gap-3"
            }`}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[#17352b]">{oferta.supermercado}</p>
                {oferta.enOferta && (
                  <span className="rounded-full bg-[#fff0c2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a6200]">
                    Oferta
                  </span>
                )}
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
            <div
              className={`flex shrink-0 items-center gap-3 text-right ${
                compacta ? "justify-between" : ""
              }`}
            >
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
