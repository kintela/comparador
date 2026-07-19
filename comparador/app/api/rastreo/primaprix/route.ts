import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import { guardarRastreoPrimaprix } from "@/servicios/primaprix/persistencia-primaprix";
import { rastrearLotePrimaprix } from "@/servicios/primaprix/rastreo-lote";
import { ejecutarConBloqueoRastreo } from "@/servicios/rastreo/bloqueo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SolicitudRastreoPrimaprix = {
  consultas?: unknown;
  resultadosPorConsulta?: unknown;
  maxProductos?: unknown;
  guardar?: unknown;
};

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  return ejecutarConBloqueoRastreo("primaprix", async () => {
    let cuerpo: SolicitudRastreoPrimaprix;
    try {
      cuerpo = (await request.json()) as SolicitudRastreoPrimaprix;
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
        : 10;
    const maxProductos =
      typeof cuerpo.maxProductos === "number" ? cuerpo.maxProductos : 250;
    const guardar = cuerpo.guardar === true;

    if (consultas.length === 0 || consultas.length > 30) {
      return Response.json(
        { ok: false, error: "Debes indicar entre 1 y 30 búsquedas válidas" },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(resultadosPorConsulta) ||
      resultadosPorConsulta < 1 ||
      resultadosPorConsulta > 30 ||
      !Number.isInteger(maxProductos) ||
      maxProductos < 1 ||
      maxProductos > 300
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Los resultados por búsqueda deben estar entre 1 y 30 y el máximo entre 1 y 300",
        },
        { status: 400 },
      );
    }

    try {
      const resultado = await rastrearLotePrimaprix({
        consultas,
        resultadosPorConsulta,
        maxProductos,
      });
      const persistencia = guardar
        ? await guardarRastreoPrimaprix({
            productos: resultado.productos,
            consultas,
            errores: resultado.errores,
          })
        : null;

      return Response.json({
        ok: true,
        guardado: guardar,
        origenPrecios:
          "Catálogo web Primaprix · tienda de referencia Santurtzi · stock local no garantizado",
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
          : "Error desconocido durante el rastreo Primaprix";
      console.error("Error en el rastreo manual de Primaprix:", mensaje);
      return Response.json({ ok: false, error: mensaje }, { status: 502 });
    }
  });
}
