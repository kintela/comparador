"use client";

import { useState, type FormEvent } from "react";

import { CONSULTAS_RASTREO_TEXTO } from "@/servicios/rastreo/configuracion";

type ProductoCoviran = {
  identificadorExterno: string;
  nombreOriginal: string;
  marcaOriginal: string | null;
  categoriaSugerida: string | null;
  precio: number;
  precioPromocional: number | null;
  textoPromocion: string | null;
};

type ResultadoCoviran = {
  ok: boolean;
  guardado?: boolean;
  origenPrecios?: string;
  productosDetectados?: number;
  peticionesRealizadas?: number;
  persistencia?: {
    preciosInsertados: number;
    productosCoincidentes: number;
    productosNormalizados: number;
  } | null;
  productos?: ProductoCoviran[];
  error?: string;
};

export function PanelRastreoCoviran() {
  const [consultasTexto, setConsultasTexto] = useState(
    CONSULTAS_RASTREO_TEXTO,
  );
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCoviran | null>(null);

  async function ejecutar(guardar: boolean) {
    if (
      guardar &&
      !window.confirm(
        "¿Guardar en Supabase las ofertas vigentes del folleto Covirán País Vasco?",
      )
    ) {
      return;
    }
    setCargando(true);
    setResultado(null);
    try {
      const respuesta = await fetch("/api/rastreo/coviran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultas: consultasTexto
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          resultadosPorConsulta: 50,
          maxProductos: 500,
          guardar,
        }),
      });
      setResultado((await respuesta.json()) as ResultadoCoviran);
    } catch {
      setResultado({ ok: false, error: "No se pudo conectar con el servidor" });
    } finally {
      setCargando(false);
    }
  }

  function previsualizar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void ejecutar(false);
  }

  const productos = [...(resultado?.productos ?? [])].sort(
    (a, b) =>
      (a.precioPromocional ?? a.precio) -
      (b.precioPromocional ?? b.precio),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <form
        onSubmit={previsualizar}
        className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-6"
      >
        <label>
          <span className="mb-2 block text-sm font-medium text-slate-300">
            Productos buscados, uno por línea
          </span>
          <textarea
            rows={16}
            value={consultasTexto}
            onChange={(evento) => setConsultasTexto(evento.target.value)}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm outline-none focus:border-violet-400"
          />
        </label>
        <div className="mt-6 grid gap-3">
          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg bg-violet-500 px-4 py-3 font-bold text-white disabled:opacity-50"
          >
            {cargando ? "Leyendo folleto…" : "Previsualizar Covirán"}
          </button>
          <button
            type="button"
            disabled={cargando}
            onClick={() => void ejecutar(true)}
            className="rounded-lg border border-violet-500/60 px-4 py-3 font-bold text-violet-300 disabled:opacity-50"
          >
            Rastrear y guardar Covirán
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Fuente: PDF oficial Covirán para País Vasco. Solo se guardan ofertas
          con vigencia reconocida y precio válido.
        </p>
      </form>

      <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        {!resultado ? (
          <div className="flex min-h-72 items-center justify-center text-slate-500">
            Previsualiza el folleto antes de guardarlo.
          </div>
        ) : null}
        {resultado && !resultado.ok ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {resultado.error ?? "El rastreo ha fallado"}
          </div>
        ) : null}
        {resultado?.ok ? (
          <>
            <div className="mb-5 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-violet-100">
              {resultado.origenPrecios}
            </div>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <Resumen
                etiqueta="Productos"
                valor={resultado.productosDetectados ?? 0}
              />
              <Resumen
                etiqueta="Descargas"
                valor={resultado.peticionesRealizadas ?? 0}
              />
              <Resumen
                etiqueta={resultado.guardado ? "Precios guardados" : "Modo"}
                valor={
                  resultado.guardado
                    ? (resultado.persistencia?.preciosInsertados ?? 0)
                    : "Previsualización"
                }
              />
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productos.map((producto) => (
                    <tr key={producto.identificadorExterno}>
                      <td className="px-4 py-3 font-medium">
                        {producto.nombreOriginal}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {producto.marcaOriginal ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {producto.categoriaSugerida ?? "Ofertas"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {producto.precioPromocional ? (
                          <>
                            <span className="mr-2 text-xs text-slate-500 line-through">
                              {formatearPrecio(producto.precio)}
                            </span>
                            <span className="font-bold text-violet-300">
                              {formatearPrecio(producto.precioPromocional)}
                            </span>
                          </>
                        ) : (
                          <span className="font-bold text-violet-300">
                            {formatearPrecio(producto.precio)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function formatearPrecio(precio: number) {
  return precio.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}

function Resumen({
  etiqueta,
  valor,
}: {
  etiqueta: string;
  valor: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        {etiqueta}
      </p>
      <p className="mt-1 text-xl font-bold">{valor}</p>
    </div>
  );
}
