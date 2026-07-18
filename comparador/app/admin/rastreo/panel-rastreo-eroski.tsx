"use client";

import { useState, type FormEvent } from "react";

import { CONSULTAS_RASTREO_TEXTO } from "@/servicios/rastreo/configuracion";

type Producto = {
  identificadorExterno: string;
  nombreOriginal: string;
  precio: number;
  disponible: boolean;
  marcaOriginal: string | null;
  categoriaSugerida?: string | null;
  urlProducto: string;
};

type Resultado = {
  ok: boolean;
  guardado?: boolean;
  productosDetectados?: number;
  peticionesRealizadas?: number;
  errores?: Array<{ consulta: string; pagina: number; mensaje: string }>;
  persistencia?: {
    ejecucionId: string;
    productosNuevos: number;
    preciosInsertados: number;
    marcasCreadas: number;
    categoriasCreadas: number;
    productosNormalizados: number;
  } | null;
  productos?: Producto[];
  error?: string;
};

export function PanelRastreoEroski() {
  const [token, setToken] = useState("");
  const [consultasTexto, setConsultasTexto] = useState(CONSULTAS_RASTREO_TEXTO);
  const [paginas, setPaginas] = useState(1);
  const [maxProductos, setMaxProductos] = useState(250);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function ejecutar(guardar: boolean) {
    if (guardar && !window.confirm("¿Guardar este rastreo y sus precios en Supabase?")) {
      return;
    }

    const consultas = consultasTexto
      .split("\n")
      .map((consulta) => consulta.trim())
      .filter(Boolean);

    setCargando(true);
    setResultado(null);

    try {
      const respuesta = await fetch("/api/rastreo/eroski", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          consultas,
          paginasPorConsulta: paginas,
          maxProductos,
          guardar,
        }),
      });
      const datos = (await respuesta.json()) as Resultado;
      setResultado(datos);
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

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <form
        onSubmit={previsualizar}
        className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Clave de administración
            </span>
            <input
              type="password"
              autoComplete="off"
              required
              value={token}
              onChange={(evento) => setToken(evento.target.value)}
              placeholder="ADMIN_RASTREO_TOKEN"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">
              Búsquedas, una por línea
            </span>
            <textarea
              rows={13}
              required
              value={consultasTexto}
              onChange={(evento) => setConsultasTexto(evento.target.value)}
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm outline-none transition focus:border-emerald-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="mb-2 block text-sm font-medium text-slate-300">
                Páginas
              </span>
              <select
                value={paginas}
                onChange={(evento) => setPaginas(Number(evento.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              >
                <option value={1}>1 por búsqueda</option>
                <option value={2}>2 por búsqueda</option>
                <option value={3}>3 por búsqueda</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-sm font-medium text-slate-300">
                Máximo
              </span>
              <input
                type="number"
                min={1}
                max={300}
                value={maxProductos}
                onChange={(evento) => setMaxProductos(Number(evento.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
          >
            {cargando ? "Rastreando…" : "Previsualizar rastreo"}
          </button>
          <button
            type="button"
            disabled={cargando}
            onClick={() => void ejecutar(true)}
            className="rounded-lg border border-amber-500/60 px-4 py-3 font-semibold text-amber-300 transition hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50"
          >
            Rastrear y guardar en Supabase
          </button>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          La clave se envía al servidor en una cabecera privada y no se guarda en el
          navegador.
        </p>
      </form>

      <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        {!resultado && (
          <div className="flex min-h-72 items-center justify-center text-center text-slate-500">
            <p>Configura el lote y pulsa “Previsualizar rastreo”.</p>
          </div>
        )}

        {resultado && !resultado.ok && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {resultado.error ?? "El rastreo ha fallado"}
          </div>
        )}

        {resultado?.ok && (
          <div>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
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

            {resultado.persistencia && (
              <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                Ejecución guardada. Productos nuevos: {resultado.persistencia.productosNuevos};
                normalizados: {resultado.persistencia.productosNormalizados}; marcas nuevas:{" "}
                {resultado.persistencia.marcasCreadas}; categorías nuevas:{" "}
                {resultado.persistencia.categoriasCreadas}.
              </div>
            )}

            {(resultado.errores?.length ?? 0) > 0 && (
              <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                {resultado.errores?.length} peticiones terminaron con error.
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">ID Eroski</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {resultado.productos?.map((producto) => (
                    <tr key={producto.identificadorExterno} className="hover:bg-slate-800/40">
                      <td className="max-w-md px-4 py-3">
                        <a
                          href={producto.urlProducto}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-200 hover:text-emerald-400"
                        >
                          {producto.nombreOriginal}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {producto.marcaOriginal ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {producto.categoriaSugerida ?? "Sin clasificar"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {producto.precio.toLocaleString("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            producto.disponible ? "text-emerald-400" : "text-slate-500"
                          }
                        >
                          {producto.disponible ? "Disponible" : "No disponible"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {producto.identificadorExterno}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-xl font-bold text-slate-100">{valor}</p>
    </div>
  );
}
