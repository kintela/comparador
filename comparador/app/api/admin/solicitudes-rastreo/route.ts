import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import { esRespuestaSinResultados } from "@/servicios/rastreo/errores";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESTADOS = [
  "pendiente",
  "procesando",
  "completada",
  "sin_resultados",
  "descartada",
] as const;

const SLUG_POR_CADENA: Record<string, string> = {
  Alcampo: "alcampo",
  ALDI: "aldi",
  "BM Supermercados": "bm",
  Carrefour: "carrefour",
  Costco: "costco",
  "Covirán": "coviran",
  DIA: "dia",
  Eroski: "eroski",
  Lidl: "lidl",
  Lupa: "lupa",
  Mercadona: "mercadona",
  Primaprix: "primaprix",
};

type ResultadoCadena = {
  cadena: string;
  ok: boolean;
  productos: number;
  error?: string;
};

type EstadoSolicitud = (typeof ESTADOS)[number];

function esEstado(valor: unknown): valor is EstadoSolicitud {
  return typeof valor === "string" && ESTADOS.includes(valor as EstadoSolicitud);
}

function errorSinMigracion(mensaje: string, codigo?: string) {
  return (
    codigo === "42P01" ||
    /solicitudes_rastreo|schema cache|does not exist/i.test(mensaje)
  );
}

export async function GET(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  const estado = new URL(request.url).searchParams.get("estado");
  if (estado && !esEstado(estado)) {
    return Response.json({ ok: false, error: "Estado no válido" }, { status: 400 });
  }

  const supabase = obtenerSupabaseServidor();
  let consulta = supabase
    .from("solicitudes_rastreo")
    .select(
      "id, termino_original, termino_normalizado, estado, total_solicitudes, supermercados_solicitados, productos_encontrados, detalles_resultado, fecha_primera_solicitud, fecha_ultima_solicitud, fecha_procesado, solicitudes_rastreo_progreso(supermercado, estado, productos_encontrados, mensaje_error, fecha_procesado)",
    )
    .order("total_solicitudes", { ascending: false })
    .order("fecha_ultima_solicitud", { ascending: false })
    .limit(100);

  consulta = estado
    ? consulta.eq("estado", estado)
    : consulta.in("estado", ["pendiente", "procesando", "sin_resultados"]);

  const { data, error } = await consulta;
  if (error) {
    if (errorSinMigracion(error.message, error.code)) {
      return Response.json(
        {
          ok: false,
          requiereMigracion: true,
          error:
            "Falta ejecutar la migración de solicitudes de rastreo en Supabase.",
        },
        { status: 503 },
      );
    }
    console.error("No se pudo cargar la cola de rastreo:", error.message);
    return Response.json(
      { ok: false, error: "No se pudo cargar la cola de rastreo" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, solicitudes: data ?? [] });
}

export async function PATCH(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  let cuerpo: {
    id?: unknown;
    estado?: unknown;
    productosEncontrados?: unknown;
    detalles?: unknown;
  };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "El cuerpo JSON no es válido" },
      { status: 400 },
    );
  }

  const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    !esEstado(cuerpo.estado)
  ) {
    return Response.json(
      { ok: false, error: "Solicitud o estado no válidos" },
      { status: 400 },
    );
  }

  const productosEncontrados =
    typeof cuerpo.productosEncontrados === "number" &&
    Number.isInteger(cuerpo.productosEncontrados) &&
    cuerpo.productosEncontrados >= 0
      ? cuerpo.productosEncontrados
      : null;
  const supabase = obtenerSupabaseServidor();
  const { data: solicitudActual, error: errorSolicitudActual } = await supabase
    .from("solicitudes_rastreo")
    .select("estado, supermercados_solicitados")
    .eq("id", id)
    .single();
  if (errorSolicitudActual || !solicitudActual) {
    return Response.json(
      { ok: false, error: "No se encontró la solicitud" },
      { status: 404 },
    );
  }

  const ahora = new Date().toISOString();
  if (
    cuerpo.estado === "procesando" &&
    ["completada", "sin_resultados", "descartada"].includes(
      solicitudActual.estado,
    )
  ) {
    const { error: errorLimpiar } = await supabase
      .from("solicitudes_rastreo_progreso")
      .delete()
      .eq("solicitud_rastreo_id", id);
    if (errorLimpiar) {
      console.error("No se pudo reiniciar el progreso:", errorLimpiar.message);
      return Response.json(
        { ok: false, error: "No se pudo reiniciar el progreso del rastreo" },
        { status: 500 },
      );
    }
  }

  const resultados =
    cuerpo.detalles &&
    typeof cuerpo.detalles === "object" &&
    "cadenas" in cuerpo.detalles &&
    Array.isArray(cuerpo.detalles.cadenas)
      ? (cuerpo.detalles.cadenas as ResultadoCadena[]).filter(
          (resultado) =>
            resultado &&
            typeof resultado.cadena === "string" &&
            typeof resultado.ok === "boolean" &&
            typeof resultado.productos === "number" &&
            Number.isInteger(resultado.productos) &&
            resultado.productos >= 0 &&
            Boolean(SLUG_POR_CADENA[resultado.cadena]),
        )
      : [];
  let estadoFinal: EstadoSolicitud = cuerpo.estado;
  let productosFinal = productosEncontrados;
  if (resultados.length > 0) {
    const { error: errorProgreso } = await supabase
      .from("solicitudes_rastreo_progreso")
      .upsert(
        resultados.map((resultado) => {
          const sinResultados =
            !resultado.ok &&
            esRespuestaSinResultados(resultado.error ?? "");
          return {
            solicitud_rastreo_id: id,
            supermercado: SLUG_POR_CADENA[resultado.cadena],
            estado: resultado.ok || sinResultados ? "completado" : "error",
            productos_encontrados: resultado.productos,
            mensaje_error:
              resultado.ok || sinResultados ? null : resultado.error ?? null,
            fecha_procesado: ahora,
            updated_at: ahora,
          };
        }),
        { onConflict: "solicitud_rastreo_id,supermercado" },
      );
    if (errorProgreso) {
      console.error("No se pudo guardar el progreso:", errorProgreso.message);
      return Response.json(
        { ok: false, error: "No se pudo guardar el progreso por supermercado" },
        { status: 500 },
      );
    }

    const objetivos = (
      (solicitudActual.supermercados_solicitados as string[]) ?? []
    )
      .map((cadena) => SLUG_POR_CADENA[cadena])
      .filter((slug): slug is string => Boolean(slug));
    const { data: progresos, error: errorConsultarProgreso } = await supabase
      .from("solicitudes_rastreo_progreso")
      .select("supermercado, estado, productos_encontrados")
      .eq("solicitud_rastreo_id", id)
      .in(
        "supermercado",
        objetivos.length > 0 ? objetivos : Object.values(SLUG_POR_CADENA),
      );
    if (errorConsultarProgreso) {
      return Response.json(
        { ok: false, error: "No se pudo comprobar el progreso del rastreo" },
        { status: 500 },
      );
    }
    const objetivosEfectivos =
      objetivos.length > 0 ? objetivos : Object.values(SLUG_POR_CADENA);
    const completados = (progresos ?? []).filter(
      (progreso) => progreso.estado === "completado",
    );
    productosFinal = completados.reduce(
      (total, progreso) => total + progreso.productos_encontrados,
      0,
    );
    estadoFinal =
      completados.length >= objetivosEfectivos.length
        ? productosFinal > 0
          ? "completada"
          : "sin_resultados"
        : "pendiente";
  }

  const finalizada = ["completada", "sin_resultados", "descartada"].includes(
    estadoFinal,
  );

  const { data, error } = await supabase
    .from("solicitudes_rastreo")
    .update({
      estado: estadoFinal,
      productos_encontrados: productosFinal,
      detalles_resultado:
        cuerpo.detalles && typeof cuerpo.detalles === "object"
          ? cuerpo.detalles
          : null,
      fecha_procesado: finalizada ? ahora : null,
      updated_at: ahora,
    })
    .eq("id", id)
    .select(
      "id, termino_original, estado, total_solicitudes, supermercados_solicitados, productos_encontrados, fecha_ultima_solicitud, fecha_procesado, solicitudes_rastreo_progreso(supermercado, estado, productos_encontrados, mensaje_error, fecha_procesado)",
    )
    .single();

  if (error) {
    console.error("No se pudo actualizar la solicitud:", error.message);
    return Response.json(
      { ok: false, error: "No se pudo actualizar la solicitud" },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, solicitud: data });
}
