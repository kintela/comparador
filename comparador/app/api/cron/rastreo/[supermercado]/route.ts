import { guardarRastreoAlcampo } from "@/servicios/alcampo/persistencia-alcampo";
import { rastrearLoteAlcampo } from "@/servicios/alcampo/rastreo-lote";
import { guardarRastreoAldi } from "@/servicios/aldi/persistencia-aldi";
import { rastrearLoteAldi } from "@/servicios/aldi/rastreo-lote";
import { guardarRastreoBm } from "@/servicios/bm/persistencia-bm";
import { rastrearLoteBm } from "@/servicios/bm/rastreo-lote";
import { autorizarCron } from "@/servicios/cron/autorizacion";
import { guardarRastreoDia } from "@/servicios/dia/persistencia-dia";
import { rastrearLoteDia } from "@/servicios/dia/rastreo-lote";
import { guardarRastreoEroski } from "@/servicios/eroski/persistencia-eroski";
import { rastrearLoteEroski } from "@/servicios/eroski/rastreo-lote";
import { guardarRastreoLidl } from "@/servicios/lidl/persistencia-lidl";
import { rastrearLoteLidl } from "@/servicios/lidl/rastreo-lote";
import { guardarRastreoLupa } from "@/servicios/lupa/persistencia-lupa";
import { rastrearLoteLupa } from "@/servicios/lupa/rastreo-lote";
import { guardarRastreoMercadona } from "@/servicios/mercadona/persistencia-mercadona";
import { rastrearLoteMercadona } from "@/servicios/mercadona/rastreo-lote";
import {
  adquirirBloqueoRastreo,
  liberarBloqueoRastreo,
} from "@/servicios/rastreo/bloqueo";
import { CONFIGURACION_RASTREO_AUTOMATICO } from "@/servicios/rastreo/configuracion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPERMERCADOS = [
  "eroski",
  "bm",
  "mercadona",
  "aldi",
  "dia",
  "lidl",
  "alcampo",
  "lupa",
] as const;

type Supermercado = (typeof SUPERMERCADOS)[number];
type ResumenCron = {
  productosDetectados: number;
  peticionesRealizadas: number;
  erroresDetectados: number;
  ejecucionId: string;
  preciosInsertados: number;
};

function esSupermercado(valor: string): valor is Supermercado {
  return SUPERMERCADOS.includes(valor as Supermercado);
}

function crearResumen(
  resultado: {
    productos: unknown[];
    peticionesRealizadas: number;
    errores: unknown[];
  },
  persistencia: { ejecucionId: string; preciosInsertados: number },
): ResumenCron {
  return {
    productosDetectados: resultado.productos.length,
    peticionesRealizadas: resultado.peticionesRealizadas,
    erroresDetectados: resultado.errores.length,
    ejecucionId: persistencia.ejecucionId,
    preciosInsertados: persistencia.preciosInsertados,
  };
}

async function ejecutarRastreo(supermercado: Supermercado): Promise<ResumenCron> {
  const {
    consultas,
    resultadosPorConsulta,
    paginasEroskiPorConsulta,
    maxProductos,
    codigoPostalMercadona,
  } = CONFIGURACION_RASTREO_AUTOMATICO;

  const parametros = { consultas, resultadosPorConsulta, maxProductos };
  const tipoRastreo = "automatico" as const;

  switch (supermercado) {
    case "eroski": {
      const resultado = await rastrearLoteEroski({
        consultas,
        paginasPorConsulta: paginasEroskiPorConsulta,
        maxProductos,
      });
      const persistencia = await guardarRastreoEroski({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "bm": {
      const resultado = await rastrearLoteBm(parametros);
      const persistencia = await guardarRastreoBm({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "mercadona": {
      const resultado = await rastrearLoteMercadona({
        ...parametros,
        codigoPostal: codigoPostalMercadona,
      });
      const persistencia = await guardarRastreoMercadona({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        zona: resultado.zona,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "aldi": {
      const resultado = await rastrearLoteAldi(parametros);
      const persistencia = await guardarRastreoAldi({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "dia": {
      const resultado = await rastrearLoteDia(parametros);
      const persistencia = await guardarRastreoDia({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        codigoPostal: resultado.codigoPostal,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "lidl": {
      const resultado = await rastrearLoteLidl(parametros);
      const persistencia = await guardarRastreoLidl({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "alcampo": {
      const resultado = await rastrearLoteAlcampo(parametros);
      const persistencia = await guardarRastreoAlcampo({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        regionId: resultado.regionId,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
    case "lupa": {
      const resultado = await rastrearLoteLupa(parametros);
      const persistencia = await guardarRastreoLupa({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      return crearResumen(resultado, persistencia);
    }
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ supermercado: string }> },
) {
  const respuestaAutorizacion = autorizarCron(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  const { supermercado } = await params;
  if (!esSupermercado(supermercado)) {
    return Response.json(
      { ok: false, error: "Supermercado no reconocido" },
      { status: 404 },
    );
  }

  const bloqueo = await adquirirBloqueoRastreo(supermercado);
  if (!bloqueo) {
    return Response.json({
      ok: true,
      omitido: true,
      supermercado,
      motivo: "Ya existe un rastreo en curso",
    });
  }

  try {
    const resumen = await ejecutarRastreo(supermercado);
    return Response.json({
      ok: true,
      omitido: false,
      supermercado,
      ...resumen,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido en el cron";
    console.error(`Error en el cron de ${supermercado}:`, mensaje);
    return Response.json(
      { ok: false, supermercado, error: mensaje },
      { status: 502 },
    );
  } finally {
    await liberarBloqueoRastreo(bloqueo).catch((error) => {
      console.error(`No se liberó el bloqueo de ${supermercado}:`, error);
    });
  }
}
