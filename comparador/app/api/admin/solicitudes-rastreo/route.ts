import { autorizarAdmin } from "@/servicios/admin/autorizacion";
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
      "id, termino_original, termino_normalizado, estado, total_solicitudes, supermercados_solicitados, productos_encontrados, detalles_resultado, fecha_primera_solicitud, fecha_ultima_solicitud, fecha_procesado",
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
  const ahora = new Date().toISOString();
  const finalizada = ["completada", "sin_resultados", "descartada"].includes(
    cuerpo.estado,
  );
  const { data, error } = await obtenerSupabaseServidor()
    .from("solicitudes_rastreo")
    .update({
      estado: cuerpo.estado,
      productos_encontrados: productosEncontrados,
      detalles_resultado:
        cuerpo.detalles && typeof cuerpo.detalles === "object"
          ? cuerpo.detalles
          : null,
      fecha_procesado: finalizada ? ahora : null,
      updated_at: ahora,
    })
    .eq("id", id)
    .select(
      "id, termino_original, estado, total_solicitudes, supermercados_solicitados, productos_encontrados, fecha_ultima_solicitud, fecha_procesado",
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
