"use client";

import { useState, type FormEvent } from "react";

import { CONSULTAS_RASTREO_TEXTO } from "@/servicios/rastreo/configuracion";

type Producto = {
  identificadorExterno: string;
  nombreOriginal: string;
  marcaOriginal: string | null;
  precio: number;
  precioPromocional: number | null;
  disponible: boolean;
};

type Resultado = {
  ok: boolean;
  guardado?: boolean;
  origenPrecios?: string;
  productosDetectados?: number;
  peticionesRealizadas?: number;
  persistencia?: { preciosInsertados: number } | null;
  productos?: Producto[];
  errores?: Array<{ consulta: string; mensaje: string }>;
  error?: string;
};

export function PanelRastreoCostco() {
  const [consultasTexto, setConsultasTexto] = useState(CONSULTAS_RASTREO_TEXTO);
  const [resultadosPorConsulta, setResultadosPorConsulta] = useState(10);
  const [maxProductos, setMaxProductos] = useState(250);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function ejecutar(guardar: boolean) {
    if (
      guardar &&
      !window.confirm(
        "¿Rastrear Costco Bilbao y guardar sus productos y precios en Supabase?",
      )
    ) {
      return;
    }
    setCargando(true);
    setResultado(null);
    try {
      const respuesta = await fetch("/api/rastreo/costco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultas: consultasTexto
            .split("\n")
            .map((consulta) => consulta.trim())
            .filter(Boolean),
          resultadosPorConsulta,
          maxProductos,
          guardar,
        }),
      });
      setResultado((await respuesta.json()) as Resultado);
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
        className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">
            Búsquedas, una por línea
          </span>
          <textarea
            rows={13}
            value={consultasTexto}
            onChange={(evento) => setConsultasTexto(evento.target.value)}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm outline-none focus:border-red-400"
          />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <CampoNumero
            etiqueta="Por búsqueda"
            valor={resultadosPorConsulta}
            maximo={20}
            alCambiar={setResultadosPorConsulta}
          />
          <CampoNumero
            etiqueta="Máximo"
            valor={maxProductos}
            maximo={300}
            alCambiar={setMaxProductos}
          />
        </div>
        <div className="mt-6 grid gap-3">
          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {cargando ? "Rastreando…" : "Previsualizar Costco"}
          </button>
          <button
            type="button"
            disabled={cargando}
            onClick={() => void ejecutar(true)}
            className="rounded-lg border border-red-500/60 px-4 py-3 font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            Rastrear y guardar Costco
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Origen: Costco Same-Day, almacén Costco - Bilbao (Sestao). El servidor
          crea una sesión anónima nueva para cada búsqueda.
        </p>
      </form>

      <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        {!resultado && (
          <div className="flex min-h-72 items-center justify-center text-slate-500">
            Previsualiza el catálogo antes de guardarlo.
          </div>
        )}
        {resultado && !resultado.ok && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {resultado.error ?? "El rastreo ha fallado"}
          </div>
        )}
        {resultado?.ok && (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <Resumen
                etiqueta="Productos"
                valor={resultado.productosDetectados ?? 0}
              />
              <Resumen
                etiqueta="Peticiones"
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
            <div className="mb-5 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
              Origen de precios: {resultado.origenPrecios}
            </div>
            {(resultado.errores?.length ?? 0) > 0 && (
              <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
                {resultado.errores?.length} búsquedas terminaron con error.
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Producto / pack</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productos.map((producto) => (
                    <tr key={producto.identificadorExterno}>
                      <td className="max-w-lg px-4 py-3 font-medium">
                        {producto.nombreOriginal}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {producto.marcaOriginal ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {producto.disponible ? "Disponible" : "No disponible"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-red-300">
                        {(producto.precioPromocional ?? producto.precio).toLocaleString(
                          "es-ES",
                          { style: "currency", currency: "EUR" },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function CampoNumero({
  etiqueta,
  valor,
  maximo,
  alCambiar,
}: {
  etiqueta: string;
  valor: number;
  maximo: number;
  alCambiar: (valor: number) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm text-slate-300">{etiqueta}</span>
      <input
        type="number"
        min={1}
        max={maximo}
        value={valor}
        onChange={(evento) => alCambiar(Number(evento.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5"
      />
    </label>
  );
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
      <p className="text-xs uppercase tracking-wider text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-xl font-bold">{valor}</p>
    </div>
  );
}
