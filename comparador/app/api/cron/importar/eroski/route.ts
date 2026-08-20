import { autorizarCron } from "@/servicios/cron/autorizacion";
import { guardarRastreoEroski } from "@/servicios/eroski/persistencia-eroski";
import type { ResultadoLoteEroski } from "@/servicios/eroski/rastreo-lote";
import {
  adquirirBloqueoRastreo,
  liberarBloqueoRastreo,
} from "@/servicios/rastreo/bloqueo";
import { esRespuestaSinResultados } from "@/servicios/rastreo/errores";
import { registrarFalloRastreoAutomatico } from "@/servicios/rastreo/fallo-automatico";
import {
  normalizarTerminoRastreo,
  obtenerTerminosRastreo,
} from "@/servicios/rastreo/terminos";
import {
  obtenerSolicitudesAutomaticas,
  registrarResultadoSolicitudAutomatica,
} from "@/servicios/solicitudes-rastreo/automatico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function obtenerConsultas() {
  const [solicitudes, terminos] = await Promise.all([
    obtenerSolicitudesAutomaticas("eroski"),
    obtenerTerminosRastreo("eroski"),
  ]);
  const unicas = new Map<string, string>();
  for (const consulta of [
    ...solicitudes.map((solicitud) => solicitud.termino),
    ...terminos,
  ]) {
    const normalizada = normalizarTerminoRastreo(consulta);
    if (normalizada && !unicas.has(normalizada)) {
      unicas.set(normalizada, consulta);
    }
  }
  return [...unicas.values()];
}

export async function GET(request: Request) {
  const respuestaAutorizacion = autorizarCron(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;
  return Response.json({ consultas: await obtenerConsultas() });
}

type CargaEroski = {
  consultas?: string[];
  resultado?: ResultadoLoteEroski;
  error?: string;
};

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarCron(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;
  const inicio = new Date().toISOString();
  const carga = (await request.json()) as CargaEroski;
  if (carga.error) {
    await registrarFalloRastreoAutomatico("eroski", carga.error, inicio);
    return Response.json({ ok: true, errorRegistrado: true });
  }
  if (
    !Array.isArray(carga.consultas) ||
    !carga.resultado ||
    !Array.isArray(carga.resultado.productos) ||
    !Array.isArray(carga.resultado.errores)
  ) {
    return Response.json({ ok: false, error: "Carga no válida" }, { status: 400 });
  }

  const bloqueo = await adquirirBloqueoRastreo("eroski");
  if (!bloqueo) {
    return Response.json(
      { ok: false, error: "Ya existe un rastreo de Eroski en curso" },
      { status: 409 },
    );
  }
  try {
    const erroresReales = carga.resultado.errores.filter(
      (error) => !esRespuestaSinResultados(error.mensaje),
    );
    const persistencia = await guardarRastreoEroski({
      productos: carga.resultado.productos,
      consultas: carga.consultas,
      errores: erroresReales,
      tipoRastreo: "automatico",
    });
    const solicitudes = await obtenerSolicitudesAutomaticas("eroski");
    for (const solicitud of solicitudes) {
      if (!(solicitud.termino in carga.resultado.resultadosPorConsulta)) continue;
      const productosEncontrados =
        carga.resultado.resultadosPorConsulta[solicitud.termino] ?? 0;
      const error =
        productosEncontrados === 0
          ? carga.resultado.errores.find(
              (item) =>
                item.consulta === solicitud.termino &&
                !esRespuestaSinResultados(item.mensaje),
            )?.mensaje
          : undefined;
      await registrarResultadoSolicitudAutomatica({
        solicitud,
        supermercado: "eroski",
        productosEncontrados,
        error,
      });
    }
    return Response.json({
      ok: true,
      productos: carga.resultado.productos.length,
      errores: erroresReales.length,
      precios: persistencia.preciosInsertados,
    });
  } finally {
    await liberarBloqueoRastreo(bloqueo);
  }
}
