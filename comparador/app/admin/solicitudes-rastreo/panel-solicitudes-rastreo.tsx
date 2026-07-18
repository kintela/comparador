"use client";

import { useState, type FormEvent } from "react";

type EstadoSolicitud =
  | "pendiente"
  | "procesando"
  | "completada"
  | "sin_resultados"
  | "descartada";

type Solicitud = {
  id: string;
  termino_original: string;
  termino_normalizado: string;
  estado: EstadoSolicitud;
  total_solicitudes: number;
  supermercados_solicitados: string[];
  productos_encontrados: number | null;
  detalles_resultado: unknown;
  fecha_primera_solicitud: string;
  fecha_ultima_solicitud: string;
  fecha_procesado: string | null;
};

type RespuestaCola = {
  ok: boolean;
  solicitudes?: Solicitud[];
  requiereMigracion?: boolean;
  error?: string;
};

type ResultadoCadena = {
  cadena: string;
  ok: boolean;
  productos: number;
  error?: string;
};

const RASTREADORES = [
  { cadena: "Alcampo", ruta: "alcampo" },
  { cadena: "ALDI", ruta: "aldi" },
  { cadena: "BM Supermercados", ruta: "bm" },
  { cadena: "DIA", ruta: "dia" },
  { cadena: "Eroski", ruta: "eroski" },
  { cadena: "Lidl", ruta: "lidl" },
  { cadena: "Lupa", ruta: "lupa" },
  { cadena: "Covirán", ruta: "coviran" },
  { cadena: "Mercadona", ruta: "mercadona" },
] as const;

export function PanelSolicitudesRastreo() {
  const [cargando, setCargando] = useState(false);
  const [colaCargada, setColaCargada] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requiereMigracion, setRequiereMigracion] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);

  async function cargar(evento?: FormEvent<HTMLFormElement>) {
    evento?.preventDefault();
    setCargando(true);
    setError(null);
    setRequiereMigracion(false);
    setColaCargada(false);
    try {
      const respuesta = await fetch("/api/admin/solicitudes-rastreo");
      const datos = (await respuesta.json()) as RespuestaCola;
      if (!datos.ok) {
        setError(datos.error ?? "No se pudo cargar la cola");
        setRequiereMigracion(Boolean(datos.requiereMigracion));
        return;
      }
      setSolicitudes(datos.solicitudes ?? []);
      setColaCargada(true);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }

  async function actualizar(
    id: string,
    estado: EstadoSolicitud,
    productosEncontrados?: number,
    detalles?: unknown,
  ) {
    const respuesta = await fetch("/api/admin/solicitudes-rastreo", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, estado, productosEncontrados, detalles }),
    });
    const datos = (await respuesta.json()) as { ok: boolean; error?: string };
    if (!datos.ok) throw new Error(datos.error ?? "No se pudo actualizar la solicitud");
  }

  async function rastrear(solicitud: Solicitud) {
    if (
      !window.confirm(
        `¿Rastrear “${solicitud.termino_original}” y guardar lo encontrado en Supabase?`,
      )
    ) return;

    setProcesandoId(solicitud.id);
    setError(null);
    const resultados: ResultadoCadena[] = [];
    try {
      await actualizar(solicitud.id, "procesando");
      const cadenasSolicitadas = solicitud.supermercados_solicitados ?? [];
      const rastreadores =
        cadenasSolicitadas.length > 0
          ? RASTREADORES.filter((rastreador) =>
              cadenasSolicitadas.includes(rastreador.cadena),
            )
          : [...RASTREADORES];

      for (const [indice, rastreador] of rastreadores.entries()) {
        setProgreso(
          `${indice + 1}/${rastreadores.length} · Rastreando ${rastreador.cadena}`,
        );
        try {
          const cuerpo: Record<string, unknown> = {
            consultas: [solicitud.termino_original],
            resultadosPorConsulta: 20,
            maxProductos: 50,
            guardar: true,
          };
          if (rastreador.ruta === "eroski") {
            delete cuerpo.resultadosPorConsulta;
            cuerpo.paginasPorConsulta = 1;
          }
          if (rastreador.ruta === "mercadona") cuerpo.codigoPostal = "48980";

          const respuesta = await fetch(`/api/rastreo/${rastreador.ruta}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(cuerpo),
          });
          const datos = (await respuesta.json()) as {
            ok?: boolean;
            productosDetectados?: number;
            error?: string;
          };
          resultados.push({
            cadena: rastreador.cadena,
            ok: datos.ok === true,
            productos: datos.productosDetectados ?? 0,
            error: datos.ok ? undefined : datos.error,
          });
        } catch {
          resultados.push({
            cadena: rastreador.cadena,
            ok: false,
            productos: 0,
            error: "No se pudo conectar con el rastreador",
          });
        }
      }

      const total = resultados.reduce(
        (suma, resultado) => suma + resultado.productos,
        0,
      );
      await actualizar(
        solicitud.id,
        total > 0 ? "completada" : "sin_resultados",
        total,
        { cadenas: resultados },
      );
      await cargar();
    } catch (problema) {
      setError(
        problema instanceof Error ? problema.message : "El rastreo ha fallado",
      );
      try {
        await actualizar(solicitud.id, "pendiente", 0, { cadenas: resultados });
      } catch {
        // La solicitud continuará visible tras la próxima recarga.
      }
    } finally {
      setProcesandoId(null);
      setProgreso(null);
    }
  }

  async function descartar(solicitud: Solicitud) {
    if (!window.confirm(`¿Descartar la solicitud “${solicitud.termino_original}”?`)) {
      return;
    }
    try {
      await actualizar(solicitud.id, "descartada");
      setSolicitudes((actuales) =>
        actuales.filter((item) => item.id !== solicitud.id),
      );
    } catch (problema) {
      setError(
        problema instanceof Error ? problema.message : "No se pudo descartar",
      );
    }
  }

  return (
    <div>
      <form
        onSubmit={cargar}
        className="mb-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5"
      >
        <p className="text-sm text-slate-400">
          Consulta las solicitudes pendientes con la sesión actual.
        </p>
        <button
          type="submit"
          disabled={cargando || Boolean(procesandoId)}
          className="h-12 rounded-xl bg-violet-500 px-6 font-bold hover:bg-violet-400 disabled:opacity-50"
        >
          {cargando ? "Cargando…" : "Cargar solicitudes"}
        </button>
      </form>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {error}
          {requiereMigracion && (
            <p className="mt-2 text-sm text-red-100">
              Ejecuta el archivo de migración incluido en el SQL Editor de Supabase.
            </p>
          )}
        </div>
      )}
      {progreso && (
        <div className="mb-6 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 font-semibold text-violet-200">
          {progreso}
        </div>
      )}

      {!cargando && !error && solicitudes.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center text-slate-500">
          {colaCargada
            ? "No hay solicitudes pendientes."
            : "Carga la cola de solicitudes para consultar su estado."}
        </div>
      )}

      <div className="grid gap-4">
        {solicitudes.map((solicitud) => (
          <article
            key={solicitud.id}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6"
          >
            <div className="flex flex-col justify-between gap-5 sm:flex-row">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-bold">{solicitud.termino_original}</h2>
                  <Estado estado={solicitud.estado} />
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
                    {solicitud.total_solicitudes}{" "}
                    {solicitud.total_solicitudes === 1 ? "solicitud" : "solicitudes"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Última petición:{" "}
                  {new Date(solicitud.fecha_ultima_solicitud).toLocaleString("es-ES")}
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  {solicitud.supermercados_solicitados.length > 0
                    ? solicitud.supermercados_solicitados.join(" · ")
                    : "Todos los supermercados"}
                </p>
                {solicitud.productos_encontrados !== null && (
                  <p className="mt-2 text-sm font-semibold text-emerald-300">
                    {solicitud.productos_encontrados} productos detectados
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-3">
                <button
                  type="button"
                  disabled={Boolean(procesandoId)}
                  onClick={() => void rastrear(solicitud)}
                  className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold hover:bg-violet-400 disabled:opacity-50"
                >
                  {procesandoId === solicitud.id ? "Rastreando…" : "Rastrear y guardar"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(procesandoId)}
                  onClick={() => void descartar(solicitud)}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-400 hover:border-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Descartar
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Estado({ estado }: { estado: EstadoSolicitud }) {
  const estilos: Record<EstadoSolicitud, string> = {
    pendiente: "bg-amber-500/15 text-amber-300",
    procesando: "bg-blue-500/15 text-blue-300",
    completada: "bg-emerald-500/15 text-emerald-300",
    sin_resultados: "bg-slate-700 text-slate-300",
    descartada: "bg-red-500/15 text-red-300",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${estilos[estado]}`}>
      {estado.replace("_", " ")}
    </span>
  );
}
