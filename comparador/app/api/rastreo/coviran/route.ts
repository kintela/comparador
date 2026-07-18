import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import { guardarRastreoCoviran } from "@/servicios/coviran/persistencia-coviran";
import { rastrearLoteCoviran } from "@/servicios/coviran/rastreo-lote";
import { ejecutarConBloqueoRastreo } from "@/servicios/rastreo/bloqueo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SolicitudRastreoCoviran = {
  consultas?: unknown;
  resultadosPorConsulta?: unknown;
  maxProductos?: unknown;
  guardar?: unknown;
};

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  return ejecutarConBloqueoRastreo("coviran", async () => {
    let cuerpo: SolicitudRastreoCoviran;
    try {
      cuerpo = (await request.json()) as SolicitudRastreoCoviran;
    } catch {
      return Response.json(
        { ok: false, error: "El cuerpo JSON no es válido" },
        { status: 400 },
      );
    }

    const consultas = Array.isArray(cuerpo.consultas)
      ? [
          ...new Set(
            cuerpo.consultas
              .filter(
                (consulta): consulta is string => typeof consulta === "string",
              )
              .map((consulta) => consulta.trim())
              .filter(
                (consulta) => consulta.length >= 2 && consulta.length <= 60,
              ),
          ),
        ]
      : [];
    const resultadosPorConsulta =
      typeof cuerpo.resultadosPorConsulta === "number"
        ? cuerpo.resultadosPorConsulta
        : 20;
    const maxProductos =
      typeof cuerpo.maxProductos === "number" ? cuerpo.maxProductos : 250;
    const guardar = cuerpo.guardar === true;

    if (consultas.length === 0 || consultas.length > 100) {
      return Response.json(
        { ok: false, error: "Debes indicar entre 1 y 100 búsquedas válidas" },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(resultadosPorConsulta) ||
      resultadosPorConsulta < 1 ||
      resultadosPorConsulta > 50 ||
      !Number.isInteger(maxProductos) ||
      maxProductos < 1 ||
      maxProductos > 500
    ) {
      return Response.json(
        { ok: false, error: "Los límites indicados no son válidos" },
        { status: 400 },
      );
    }

    try {
      const resultado = await rastrearLoteCoviran({
        consultas,
        resultadosPorConsulta,
        maxProductos,
      });
      const persistencia = guardar
        ? await guardarRastreoCoviran({
            productos: resultado.productos,
            consultas,
            errores: resultado.errores,
          })
        : null;
      return Response.json({
        ok: true,
        guardado: guardar,
        origenPrecios:
          `Folleto oficial Covirán · País Vasco · ${resultado.vigencia}`,
        productosDetectados: resultado.productos.length,
        peticionesRealizadas: resultado.peticionesRealizadas,
        errores: resultado.errores,
        persistencia,
        productos: resultado.productos,
      });
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "Error desconocido durante el rastreo Covirán";
      console.error("Error en el rastreo manual de Covirán:", mensaje);
      return Response.json({ ok: false, error: mensaje }, { status: 502 });
    }
  });
}
