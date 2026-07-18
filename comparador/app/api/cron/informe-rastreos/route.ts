import { autorizarCron } from "@/servicios/cron/autorizacion";
import {
  crearYEnviarInformeRastreos,
  fechaInformeUtc,
} from "@/servicios/informes/informe-rastreos";
import {
  adquirirBloqueoRastreo,
  liberarBloqueoRastreo,
} from "@/servicios/rastreo/bloqueo";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const respuestaAutorizacion = autorizarCron(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  const fecha = fechaInformeUtc();
  const supabase = obtenerSupabaseServidor();
  const { data: yaEnviado, error: errorConsulta } = await supabase
    .from("informes_rastreo_enviados")
    .select("fecha, created_at")
    .eq("fecha", fecha)
    .maybeSingle();
  if (errorConsulta) {
    return Response.json(
      { ok: false, error: `No se pudo comprobar el informe: ${errorConsulta.message}` },
      { status: 500 },
    );
  }
  if (yaEnviado) {
    return Response.json({
      ok: true,
      omitido: true,
      motivo: "El informe de hoy ya fue enviado",
      enviadoEn: yaEnviado.created_at,
    });
  }

  const bloqueo = await adquirirBloqueoRastreo("informe-diario");
  if (!bloqueo) {
    return Response.json({
      ok: true,
      omitido: true,
      motivo: "Ya existe un envío del informe en curso",
    });
  }

  try {
    const { data: comprobacion, error: errorComprobacion } = await supabase
      .from("informes_rastreo_enviados")
      .select("fecha")
      .eq("fecha", fecha)
      .maybeSingle();
    if (errorComprobacion) {
      throw new Error(
        `No se pudo volver a comprobar el informe: ${errorComprobacion.message}`,
      );
    }
    if (comprobacion) {
      return Response.json({
        ok: true,
        omitido: true,
        motivo: "El informe de hoy ya fue enviado",
      });
    }

    const resultado = await crearYEnviarInformeRastreos();
    const { error: errorRegistro } = await supabase
      .from("informes_rastreo_enviados")
      .insert({
        fecha: resultado.fecha,
        destinatario: resultado.destinatario,
        message_id: resultado.messageId,
        ejecuciones_incluidas: resultado.ejecucionesIncluidas,
      });
    if (errorRegistro) {
      throw new Error(
        `El correo se envió, pero no pudo registrarse: ${errorRegistro.message}`,
      );
    }

    return Response.json({
      ok: true,
      omitido: false,
      fecha: resultado.fecha,
      ejecucionesIncluidas: resultado.ejecucionesIncluidas,
      messageId: resultado.messageId,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido al enviar el informe";
    console.error("Error en el informe diario de rastreos:", mensaje);
    return Response.json({ ok: false, error: mensaje }, { status: 502 });
  } finally {
    await liberarBloqueoRastreo(bloqueo).catch((error) => {
      console.error("No se liberó el bloqueo del informe diario:", error);
    });
  }
}
