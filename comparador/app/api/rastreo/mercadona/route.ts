import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import { guardarRastreoMercadona } from "@/servicios/mercadona/persistencia-mercadona";
import { rastrearLoteMercadona } from "@/servicios/mercadona/rastreo-lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SolicitudRastreoMercadona = {
  consultas?: unknown;
  resultadosPorConsulta?: unknown;
  maxProductos?: unknown;
  codigoPostal?: unknown;
  guardar?: unknown;
};

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  let cuerpo: SolicitudRastreoMercadona;
  try {
    cuerpo = (await request.json()) as SolicitudRastreoMercadona;
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
  const codigoPostal =
    typeof cuerpo.codigoPostal === "string" ? cuerpo.codigoPostal.trim() : "48980";
  const guardar = cuerpo.guardar === true;

  if (consultas.length === 0 || consultas.length > 30) {
    return Response.json(
      { ok: false, error: "Debes indicar entre 1 y 30 búsquedas válidas" },
      { status: 400 },
    );
  }
  if (!/^\d{5}$/.test(codigoPostal)) {
    return Response.json(
      { ok: false, error: "El código postal debe contener 5 cifras" },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(resultadosPorConsulta) ||
    resultadosPorConsulta < 1 ||
    resultadosPorConsulta > 20 ||
    !Number.isInteger(maxProductos) ||
    maxProductos < 1 ||
    maxProductos > 300
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Los resultados por búsqueda deben estar entre 1 y 20 y el máximo entre 1 y 300",
      },
      { status: 400 },
    );
  }

  try {
    const resultado = await rastrearLoteMercadona({
      consultas,
      resultadosPorConsulta,
      maxProductos,
      codigoPostal,
    });
    const persistencia = guardar
      ? await guardarRastreoMercadona({
          productos: resultado.productos,
          consultas,
          errores: resultado.errores,
          zona: resultado.zona,
        })
      : null;

    return Response.json({
      ok: true,
      guardado: guardar,
      origenPrecios: `Mercadona Online ${resultado.zona.codigoPostal}`,
      zona: resultado.zona,
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
        : "Error desconocido durante el rastreo Mercadona";
    console.error("Error en el rastreo manual de Mercadona:", mensaje);
    return Response.json({ ok: false, error: mensaje }, { status: 502 });
  }
}
