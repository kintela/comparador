import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import { guardarRastreoElCorteIngles } from "@/servicios/el-corte-ingles/persistencia-el-corte-ingles";
import { rastrearLoteElCorteIngles } from "@/servicios/el-corte-ingles/rastreo-lote";
import { ejecutarConBloqueoRastreo } from "@/servicios/rastreo/bloqueo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Solicitud = {
  consultas?: unknown;
  resultadosPorConsulta?: unknown;
  maxProductos?: unknown;
  guardar?: unknown;
};

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  return ejecutarConBloqueoRastreo("el-corte-ingles", async () => {
    let cuerpo: Solicitud;
    try {
      cuerpo = (await request.json()) as Solicitud;
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
              .filter((consulta): consulta is string => typeof consulta === "string")
              .map((consulta) => consulta.trim())
              .filter((consulta) => consulta.length >= 2 && consulta.length <= 60),
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
      resultadosPorConsulta > 24 ||
      !Number.isInteger(maxProductos) ||
      maxProductos < 1 ||
      maxProductos > 300
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Los resultados por búsqueda deben estar entre 1 y 24 y el máximo entre 1 y 300",
        },
        { status: 400 },
      );
    }

    try {
      const resultado = await rastrearLoteElCorteIngles({
        consultas,
        resultadosPorConsulta,
        maxProductos,
      });
      const persistencia = guardar
        ? await guardarRastreoElCorteIngles({
            productos: resultado.productos,
            consultas,
            errores: resultado.errores,
            centroEntrega: resultado.centroEntrega,
          })
        : null;

      return Response.json({
        ok: true,
        guardado: guardar,
        origenPrecios:
          `Supermercado El Corte Inglés Online · centro de entrega ${resultado.centroEntrega}`,
        centroEntrega: resultado.centroEntrega,
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
          : "Error desconocido durante el rastreo de El Corte Inglés";
      console.error("Error en el rastreo manual de El Corte Inglés:", mensaje);
      return Response.json({ ok: false, error: mensaje }, { status: 502 });
    }
  });
}
