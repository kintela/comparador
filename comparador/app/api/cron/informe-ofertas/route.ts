import { autorizarCron } from "@/servicios/cron/autorizacion";
import {
  crearYEnviarInformeOfertas,
  esHoraInformeOfertas,
  fechaInformeOfertasMadrid,
} from "@/servicios/informes/informe-ofertas";
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

  if (!esHoraInformeOfertas()) {
    return Response.json({
      ok: true,
      omitido: true,
      motivo: "Todavía no son las 09:00 en Europe/Madrid",
    });
  }

  const fecha = fechaInformeOfertasMadrid();
  const supabase = obtenerSupabaseServidor();
  const { data: yaEnviado, error: errorConsulta } = await supabase
    .from("informes_ofertas_enviados")
    .select("fecha, created_at")
    .eq("fecha", fecha)
    .maybeSingle();
  if (errorConsulta) {
    return Response.json(
      {
        ok: false,
        error: `No se pudo comprobar el informe de ofertas: ${errorConsulta.message}`,
      },
      { status: 500 },
    );
  }
  if (yaEnviado) {
    return Response.json({
      ok: true,
      omitido: true,
      motivo: "El informe de ofertas de hoy ya fue enviado",
      enviadoEn: yaEnviado.created_at,
    });
  }

  const bloqueo = await adquirirBloqueoRastreo("informe-ofertas-diario");
  if (!bloqueo) {
    return Response.json({
      ok: true,
      omitido: true,
      motivo: "Ya existe un envío del informe de ofertas en curso",
    });
  }

  try {
    const resultado = await crearYEnviarInformeOfertas();
    const { error: errorRegistro } = await supabase
      .from("informes_ofertas_enviados")
      .insert({
        fecha: resultado.fecha,
        destinatario: resultado.destinatario,
        message_id: resultado.messageId,
        ofertas_incluidas: resultado.ofertasIncluidas,
      });
    if (errorRegistro) {
      throw new Error(
        `El correo de ofertas se envió, pero no pudo registrarse: ${errorRegistro.message}`,
      );
    }

    return Response.json({
      ok: true,
      omitido: false,
      fecha: resultado.fecha,
      ofertasIncluidas: resultado.ofertasIncluidas,
      messageId: resultado.messageId,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : "Error desconocido al enviar el informe de ofertas";
    console.error("Error en el informe diario de ofertas:", mensaje);
    return Response.json({ ok: false, error: mensaje }, { status: 502 });
  } finally {
    await liberarBloqueoRastreo(bloqueo).catch((error) => {
      console.error("No se liberó el bloqueo del informe de ofertas:", error);
    });
  }
}
