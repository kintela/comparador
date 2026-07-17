import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import { rastrearProductosEroski } from "@/servicios/eroski/cliente-eroski";
import { guardarRastreoEroski } from "@/servicios/eroski/persistencia-eroski";
import { rastrearLoteEroski } from "@/servicios/eroski/rastreo-lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SolicitudRastreo = {
  consultas?: unknown;
  paginasPorConsulta?: unknown;
  maxProductos?: unknown;
  guardar?: unknown;
};

function enteroAcotado(
  valor: string | null,
  predeterminado: number,
  minimo: number,
  maximo: number,
): number | null {
  if (valor === null) return predeterminado;
  if (!/^\d+$/.test(valor)) return null;

  const numero = Number.parseInt(valor, 10);
  return numero >= minimo && numero <= maximo ? numero : null;
}

export async function GET(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  const parametros = new URL(request.url).searchParams;
  const consulta = parametros.get("q")?.trim() ?? "";
  const pagina = enteroAcotado(parametros.get("pagina"), 0, 0, 100);
  const limite = enteroAcotado(parametros.get("limite"), 24, 1, 48);

  if (consulta.length < 2 || consulta.length > 100) {
    return Response.json(
      { ok: false, error: "El parámetro q debe tener entre 2 y 100 caracteres" },
      { status: 400 },
    );
  }

  if (pagina === null || limite === null) {
    return Response.json(
      {
        ok: false,
        error: "pagina debe estar entre 0 y 100 y limite entre 1 y 48",
      },
      { status: 400 },
    );
  }

  try {
    const resultado = await rastrearProductosEroski(consulta, pagina);

    return Response.json({
      ok: true,
      ...resultado,
      productos: resultado.productos.slice(0, limite),
      productosEnRespuesta: Math.min(resultado.productos.length, limite),
    });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido durante el rastreo";

    console.error("Error al rastrear Eroski:", mensaje);
    return Response.json({ ok: false, error: mensaje }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  let cuerpo: SolicitudRastreo;
  try {
    cuerpo = (await request.json()) as SolicitudRastreo;
  } catch {
    return Response.json({ ok: false, error: "El cuerpo JSON no es válido" }, { status: 400 });
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
  const paginasPorConsulta =
    typeof cuerpo.paginasPorConsulta === "number" ? cuerpo.paginasPorConsulta : 1;
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
    !Number.isInteger(paginasPorConsulta) ||
    paginasPorConsulta < 1 ||
    paginasPorConsulta > 3 ||
    !Number.isInteger(maxProductos) ||
    maxProductos < 1 ||
    maxProductos > 300
  ) {
    return Response.json(
      {
        ok: false,
        error: "Las páginas deben estar entre 1 y 3 y el máximo entre 1 y 300",
      },
      { status: 400 },
    );
  }

  try {
    const resultado = await rastrearLoteEroski({
      consultas,
      paginasPorConsulta,
      maxProductos,
    });
    const persistencia = guardar
      ? await guardarRastreoEroski({
          productos: resultado.productos,
          consultas,
          errores: resultado.errores,
        })
      : null;

    return Response.json({
      ok: true,
      guardado: guardar,
      productosDetectados: resultado.productos.length,
      peticionesRealizadas: resultado.peticionesRealizadas,
      errores: resultado.errores,
      persistencia,
      productos: resultado.productos,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido durante el rastreo";

    console.error("Error en el rastreo manual de Eroski:", mensaje);
    return Response.json({ ok: false, error: mensaje }, { status: 502 });
  }
}
