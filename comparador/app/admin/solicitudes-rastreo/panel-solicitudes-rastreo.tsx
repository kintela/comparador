"use client";

import { useCallback, useEffect, useState } from "react";

import { esRespuestaSinResultados } from "@/servicios/rastreo/errores";

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
  solicitudes_rastreo_progreso: Array<{
    supermercado: string;
    estado: "completado" | "error";
    productos_encontrados: number;
    mensaje_error: string | null;
    fecha_procesado: string;
  }>;
};

type SolicitudActualizada = Pick<
  Solicitud,
  | "id"
  | "termino_original"
  | "estado"
  | "total_solicitudes"
  | "supermercados_solicitados"
  | "productos_encontrados"
  | "fecha_ultima_solicitud"
  | "fecha_procesado"
  | "solicitudes_rastreo_progreso"
>;

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

type Confirmacion =
  | { tipo: "rastrear"; solicitud: Solicitud }
  | { tipo: "descartar"; solicitud: Solicitud }
  | { tipo: "rastrear_todas" };

type Progreso = {
  paso: number;
  total: number;
  texto: string;
};

const RASTREADORES = [
  { cadena: "Alcampo", ruta: "alcampo" },
  { cadena: "ALDI", ruta: "aldi" },
  { cadena: "BM Supermercados", ruta: "bm" },
  { cadena: "Carrefour", ruta: "carrefour" },
  { cadena: "Costco", ruta: "costco" },
  { cadena: "DIA", ruta: "dia" },
  { cadena: "El Corte Inglés", ruta: "el-corte-ingles" },
  { cadena: "Eroski", ruta: "eroski" },
  { cadena: "Lidl", ruta: "lidl" },
  { cadena: "Lupa", ruta: "lupa" },
  { cadena: "Covirán", ruta: "coviran" },
  { cadena: "Mercadona", ruta: "mercadona" },
  { cadena: "Primaprix", ruta: "primaprix" },
] as const;

export function PanelSolicitudesRastreo() {
  const [cargando, setCargando] = useState(true);
  const [colaCargada, setColaCargada] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [procesandoTodas, setProcesandoTodas] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requiereMigracion, setRequiereMigracion] = useState(false);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [accionModalEnCurso, setAccionModalEnCurso] = useState(false);

  const cargar = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(temporizador);
  }, [cargar]);

  async function actualizar(
    id: string,
    estado: EstadoSolicitud,
    productosEncontrados?: number,
    detalles?: unknown,
  ): Promise<SolicitudActualizada> {
    const respuesta = await fetch("/api/admin/solicitudes-rastreo", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, estado, productosEncontrados, detalles }),
    });
    const datos = (await respuesta.json()) as {
      ok: boolean;
      solicitud?: SolicitudActualizada;
      error?: string;
    };
    if (!datos.ok) throw new Error(datos.error ?? "No se pudo actualizar la solicitud");
    if (!datos.solicitud) {
      throw new Error("El servidor no devolvió la solicitud actualizada");
    }
    return datos.solicitud;
  }

  function obtenerRastreadores(solicitud: Solicitud) {
    const cadenasSolicitadas = solicitud.supermercados_solicitados ?? [];
    const cadenasCompletadas = new Set(
      (["completada", "sin_resultados", "descartada"].includes(
        solicitud.estado,
      )
        ? []
        : solicitud.solicitudes_rastreo_progreso ?? [])
        .filter((item) => item.estado === "completado")
        .map((item) => item.supermercado),
    );
    return cadenasSolicitadas.length > 0
      ? RASTREADORES.filter(
          (rastreador) =>
            cadenasSolicitadas.includes(rastreador.cadena) &&
            !cadenasCompletadas.has(rastreador.ruta),
        )
      : [...RASTREADORES];
  }

  async function procesarSolicitud({
    solicitud,
    rastreadores,
    pasosCompletados,
    totalPasos,
    indiceSolicitud,
    totalSolicitudes,
    recargarAlFinal,
  }: {
    solicitud: Solicitud;
    rastreadores: ReturnType<typeof obtenerRastreadores>;
    pasosCompletados: number;
    totalPasos: number;
    indiceSolicitud: number;
    totalSolicitudes: number;
    recargarAlFinal: boolean;
  }) {
    setProcesandoId(solicitud.id);
    setError(null);
    const resultados: ResultadoCadena[] = [];
    try {
      await actualizar(solicitud.id, "procesando");

      for (const [indice, rastreador] of rastreadores.entries()) {
        setProgreso({
          paso: pasosCompletados + indice + 1,
          total: Math.max(totalPasos, 1),
          texto:
            totalSolicitudes > 1
              ? `Solicitud ${indiceSolicitud}/${totalSolicitudes} · ${solicitud.termino_original} · ${rastreador.cadena}`
              : `${solicitud.termino_original} · Rastreando ${rastreador.cadena}`,
        });
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
      const hayErroresReales = resultados.some(
        (resultado) =>
          !resultado.ok &&
          !esRespuestaSinResultados(resultado.error ?? ""),
      );
      const solicitudActualizada = await actualizar(
        solicitud.id,
        hayErroresReales
          ? "pendiente"
          : total > 0
            ? "completada"
            : "sin_resultados",
        total,
        { cadenas: resultados },
      );
      setSolicitudes((actuales) =>
        solicitudActualizada.estado === "completada"
          ? actuales.filter((item) => item.id !== solicitud.id)
          : actuales.map((item) =>
              item.id === solicitud.id
                ? { ...item, ...solicitudActualizada }
                : item,
            ),
      );
      if (recargarAlFinal) await cargar();
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
      if (recargarAlFinal) setProgreso(null);
    }
  }

  async function rastrear(solicitud: Solicitud) {
    const rastreadores = obtenerRastreadores(solicitud);
    await procesarSolicitud({
      solicitud,
      rastreadores,
      pasosCompletados: 0,
      totalPasos: rastreadores.length,
      indiceSolicitud: 1,
      totalSolicitudes: 1,
      recargarAlFinal: true,
    });
  }

  async function rastrearTodas() {
    const planes = solicitudes.map((solicitud) => ({
      solicitud,
      rastreadores: obtenerRastreadores(solicitud),
    }));
    const totalPasos = planes.reduce(
      (total, plan) => total + plan.rastreadores.length,
      0,
    );
    let pasosCompletados = 0;

    setProcesandoTodas(true);
    setError(null);
    try {
      for (const [indice, plan] of planes.entries()) {
        await procesarSolicitud({
          ...plan,
          pasosCompletados,
          totalPasos,
          indiceSolicitud: indice + 1,
          totalSolicitudes: planes.length,
          recargarAlFinal: false,
        });
        pasosCompletados += plan.rastreadores.length;
      }
      await cargar();
    } finally {
      setProcesandoTodas(false);
      setProcesandoId(null);
      setProgreso(null);
    }
  }

  async function descartar(solicitud: Solicitud) {
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

  async function confirmarAccion() {
    if (!confirmacion || accionModalEnCurso) return;
    const accion = confirmacion;
    setAccionModalEnCurso(true);
    if (accion.tipo !== "descartar") setConfirmacion(null);
    try {
      if (accion.tipo === "rastrear") {
        await rastrear(accion.solicitud);
      } else if (accion.tipo === "rastrear_todas") {
        await rastrearTodas();
      } else {
        await descartar(accion.solicitud);
        setConfirmacion(null);
      }
    } finally {
      setAccionModalEnCurso(false);
    }
  }

  return (
    <div>
      <div
        className="mb-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5"
      >
        <p className="text-sm text-slate-400">
          Las solicitudes se cargan automáticamente. Al terminar, solo
          permanecerán las que tengan incidencias o no hayan devuelto productos.
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={
              cargando ||
              procesandoTodas ||
              Boolean(procesandoId) ||
              solicitudes.length === 0
            }
            onClick={() => setConfirmacion({ tipo: "rastrear_todas" })}
            className="h-12 rounded-xl bg-violet-500 px-5 font-bold hover:bg-violet-400 disabled:opacity-50"
          >
            {procesandoTodas ? "Rastreando todas…" : "Rastrear todas"}
          </button>
          <button
            type="button"
            disabled={cargando || procesandoTodas || Boolean(procesandoId)}
            onClick={() => void cargar()}
            className="h-12 rounded-xl border border-slate-700 px-5 font-bold text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
          >
            {cargando ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </div>

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
        <div className="mb-6 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-violet-100">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span>{progreso.texto}</span>
            <span className="shrink-0">
              {progreso.paso}/{progreso.total}
            </span>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label="Progreso del rastreo"
            aria-valuemin={0}
            aria-valuemax={progreso.total}
            aria-valuenow={Math.min(progreso.paso, progreso.total)}
          >
            <div
              className="h-full rounded-full bg-violet-400 transition-[width] duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (progreso.paso / Math.max(progreso.total, 1)) * 100,
                )}%`,
              }}
            />
          </div>
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
                <Incidencias solicitud={solicitud} />
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-3">
                <button
                  type="button"
                  disabled={procesandoTodas || Boolean(procesandoId)}
                  onClick={() =>
                    setConfirmacion({ tipo: "rastrear", solicitud })
                  }
                  className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold hover:bg-violet-400 disabled:opacity-50"
                >
                  {procesandoId === solicitud.id ? "Rastreando…" : "Rastrear y guardar"}
                </button>
                <button
                  type="button"
                  disabled={procesandoTodas || Boolean(procesandoId)}
                  onClick={() =>
                    setConfirmacion({ tipo: "descartar", solicitud })
                  }
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-400 hover:border-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Descartar
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {confirmacion && (
        <ModalConfirmacion
          confirmacion={confirmacion}
          totalSolicitudes={solicitudes.length}
          enCurso={accionModalEnCurso}
          onCancelar={() => setConfirmacion(null)}
          onConfirmar={() => void confirmarAccion()}
        />
      )}
    </div>
  );
}

function Incidencias({ solicitud }: { solicitud: Solicitud }) {
  const incidencias = solicitud.solicitudes_rastreo_progreso.filter(
    (item) => item.estado === "error",
  );

  return (
    <>
      {solicitud.estado === "sin_resultados" && (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No se encontró ningún producto en los supermercados consultados.
        </p>
      )}
      {incidencias.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="font-bold">Problemas durante el rastreo:</p>
          <ul className="mt-2 space-y-1">
            {incidencias.map((incidencia) => (
              <li key={incidencia.supermercado}>
                {nombreSupermercado(incidencia.supermercado)}:{" "}
                {incidencia.mensaje_error ??
                  "El rastreador no pudo completar la consulta"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function nombreSupermercado(ruta: string) {
  return (
    RASTREADORES.find((rastreador) => rastreador.ruta === ruta)?.cadena ?? ruta
  );
}

function ModalConfirmacion({
  confirmacion,
  totalSolicitudes,
  enCurso,
  onCancelar,
  onConfirmar,
}: {
  confirmacion: Confirmacion;
  totalSolicitudes: number;
  enCurso: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const esDescarte = confirmacion.tipo === "descartar";
  const titulo =
    confirmacion.tipo === "rastrear_todas"
      ? "Rastrear todas las solicitudes"
      : esDescarte
        ? "Descartar solicitud"
        : "Rastrear y guardar";
  const descripcion =
    confirmacion.tipo === "rastrear_todas"
      ? `Se procesarán ${totalSolicitudes} solicitudes una detrás de otra y se guardarán los productos encontrados.`
      : esDescarte
        ? `La solicitud “${confirmacion.solicitud.termino_original}” dejará de aparecer en la cola.`
        : `Se rastreará “${confirmacion.solicitud.termino_original}” en los supermercados pendientes y se guardarán los resultados.`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !enCurso) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmacion"
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-violet-400">
          Confirmación
        </p>
        <h2 id="titulo-confirmacion" className="mt-2 text-2xl font-bold">
          {titulo}
        </h2>
        <p className="mt-3 leading-7 text-slate-400">{descripcion}</p>
        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            disabled={enCurso}
            onClick={onCancelar}
            className="rounded-xl border border-slate-700 px-5 py-2.5 font-bold text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enCurso}
            onClick={onConfirmar}
            className={`rounded-xl px-5 py-2.5 font-bold text-white disabled:opacity-50 ${
              esDescarte
                ? "bg-red-600 hover:bg-red-500"
                : "bg-violet-500 hover:bg-violet-400"
            }`}
          >
            {enCurso
              ? "Procesando…"
              : esDescarte
                ? "Descartar"
                : "Rastrear y guardar"}
          </button>
        </div>
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
