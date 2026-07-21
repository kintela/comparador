import { autorizarCron } from "@/servicios/cron/autorizacion";
import {
  adquirirBloqueoRastreo,
  liberarBloqueoRastreo,
} from "@/servicios/rastreo/bloqueo";
import { CONFIGURACION_RASTREO_AUTOMATICO } from "@/servicios/rastreo/configuracion";
import { esRespuestaSinResultados } from "@/servicios/rastreo/errores";
import {
  desactivarReferenciasNoEncontradas,
  obtenerReferenciasNoActualizadas,
} from "@/servicios/rastreo/referencias-pendientes";
import {
  normalizarTerminoRastreo,
  obtenerTerminosRastreo,
  SUPERMERCADOS_RASTREO,
  type SupermercadoRastreo,
} from "@/servicios/rastreo/terminos";
import {
  obtenerSolicitudesAutomaticas,
  registrarResultadoSolicitudAutomatica,
  type SolicitudAutomatica,
} from "@/servicios/solicitudes-rastreo/automatico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ResumenCron = {
  productosDetectados: number;
  peticionesRealizadas: number;
  erroresDetectados: number;
  ejecucionId: string;
  preciosInsertados: number;
  solicitudesProcesadas: number;
  referenciasReintentadas: number;
  referenciasActualizadas: number;
  referenciasDesactivadas: number;
};

function esSupermercado(valor: string): valor is SupermercadoRastreo {
  return SUPERMERCADOS_RASTREO.includes(valor as SupermercadoRastreo);
}

function crearResumen(
  resultado: {
    productos: unknown[];
    peticionesRealizadas: number;
    errores: unknown[];
  },
  persistencia: { ejecucionId: string; preciosInsertados: number },
  solicitudesProcesadas: number,
): ResumenCron {
  return {
    productosDetectados: resultado.productos.length,
    peticionesRealizadas: resultado.peticionesRealizadas,
    erroresDetectados: resultado.errores.length,
    ejecucionId: persistencia.ejecucionId,
    preciosInsertados: persistencia.preciosInsertados,
    solicitudesProcesadas,
    referenciasReintentadas: 0,
    referenciasActualizadas: 0,
    referenciasDesactivadas: 0,
  };
}

type ProductoIdentificable = {
  identificadorExterno: string;
};

type ResultadoFallback = {
  productos: ProductoIdentificable[];
  peticionesRealizadas: number;
  resultadosPorConsulta: Record<string, number>;
  errores: Array<{ consulta: string; mensaje: string }>;
};

async function completarReferencias<R extends ResultadoFallback>({
  supermercado,
  desde,
  rastrear,
  persistir,
}: {
  supermercado: SupermercadoRastreo;
  desde: string;
  rastrear: (consultas: string[]) => Promise<R>;
  persistir: (
    productos: R["productos"],
    resultado: R,
    consultas: string[],
  ) => Promise<{ preciosInsertados: number }>;
}): Promise<{
  reintentadas: number;
  actualizadas: number;
  desactivadas: number;
  peticiones: number;
  precios: number;
}> {
  const referencias = await obtenerReferenciasNoActualizadas({
    supermercado,
    desde,
  });
  if (referencias.length === 0) {
    return {
      reintentadas: 0,
      actualizadas: 0,
      desactivadas: 0,
      peticiones: 0,
      precios: 0,
    };
  }

  const consultas = [
    ...new Set(referencias.map((referencia) => referencia.nombreOriginal)),
  ];
  const identificadores = new Set(
    referencias.map((referencia) => referencia.identificadorExterno),
  );

  try {
    const resultado = await rastrear(consultas);
    const productos = resultado.productos.filter((producto) =>
      identificadores.has(producto.identificadorExterno),
    );
    const encontrados = new Set(
      productos.map((producto) => producto.identificadorExterno),
    );
    const noEncontradas = referencias.filter((referencia) => {
      if (encontrados.has(referencia.identificadorExterno)) return false;
      if (
        !Object.prototype.hasOwnProperty.call(
          resultado.resultadosPorConsulta,
          referencia.nombreOriginal,
        )
      ) {
        return false;
      }
      const errores = resultado.errores.filter(
        (error) => error.consulta === referencia.nombreOriginal,
      );
      return (
        errores.length === 0 ||
        errores.every((error) => esRespuestaSinResultados(error.mensaje))
      );
    });
    const desactivadas = await desactivarReferenciasNoEncontradas({
      supermercado,
      identificadores: noEncontradas.map(
        (referencia) => referencia.identificadorExterno,
      ),
    });
    if (productos.length === 0) {
      return {
        reintentadas: referencias.length,
        actualizadas: 0,
        desactivadas,
        peticiones: resultado.peticionesRealizadas,
        precios: 0,
      };
    }
    const persistencia = await persistir(productos, resultado, consultas);
    return {
      reintentadas: referencias.length,
      actualizadas: productos.length,
      desactivadas,
      peticiones: resultado.peticionesRealizadas,
      precios: persistencia.preciosInsertados,
    };
  } catch (error) {
    console.error(
      `No se pudieron completar referencias de ${supermercado}:`,
      error instanceof Error ? error.message : error,
    );
    return {
      reintentadas: referencias.length,
      actualizadas: 0,
      desactivadas: 0,
      peticiones: 0,
      precios: 0,
    };
  }
}

function sumarReferencias(
  resumen: ResumenCron,
  extra: Awaited<ReturnType<typeof completarReferencias>>,
): ResumenCron {
  return {
    ...resumen,
    peticionesRealizadas: resumen.peticionesRealizadas + extra.peticiones,
    preciosInsertados: resumen.preciosInsertados + extra.precios,
    referenciasReintentadas: extra.reintentadas,
    referenciasActualizadas: extra.actualizadas,
    referenciasDesactivadas: extra.desactivadas,
  };
}

function combinarConsultas(
  solicitudes: SolicitudAutomatica[],
  terminos: string[],
): string[] {
  const consultas = new Map<string, string>();
  for (const consulta of [
    ...solicitudes.map((solicitud) => solicitud.termino),
    ...terminos,
  ]) {
    const normalizada = normalizarTerminoRastreo(consulta);
    if (normalizada && !consultas.has(normalizada)) {
      consultas.set(normalizada, consulta);
    }
  }
  return [...consultas.values()];
}

async function guardarResultadosSolicitudes(
  supermercado: SupermercadoRastreo,
  solicitudes: SolicitudAutomatica[],
  resultado: {
    resultadosPorConsulta: Record<string, number>;
    errores: Array<{ consulta: string; mensaje: string }>;
  },
): Promise<number> {
  let procesadas = 0;
  for (const solicitud of solicitudes) {
    if (
      !Object.prototype.hasOwnProperty.call(
        resultado.resultadosPorConsulta,
        solicitud.termino,
      )
    ) {
      continue;
    }

    const productosEncontrados =
      resultado.resultadosPorConsulta[solicitud.termino] ?? 0;
    const error =
      productosEncontrados === 0
        ? resultado.errores.find(
            (item) =>
              item.consulta === solicitud.termino &&
              !esRespuestaSinResultados(item.mensaje),
          )?.mensaje
        : undefined;
    await registrarResultadoSolicitudAutomatica({
      solicitud,
      supermercado,
      productosEncontrados,
      error,
    });
    procesadas += 1;
  }
  return procesadas;
}

async function ejecutarRastreo(
  supermercado: SupermercadoRastreo,
): Promise<ResumenCron> {
  const inicioActualizacion = new Date().toISOString();
  const {
    resultadosPorConsulta,
    paginasEroskiPorConsulta,
    maxProductos,
    codigoPostalMercadona,
  } = CONFIGURACION_RASTREO_AUTOMATICO;
  const [solicitudes, terminos] = await Promise.all([
    obtenerSolicitudesAutomaticas(supermercado),
    obtenerTerminosRastreo(supermercado),
  ]);
  const consultas = combinarConsultas(solicitudes, terminos);
  if (consultas.length === 0) {
    throw new Error(
      `No hay términos de rastreo activos para ${supermercado}`,
    );
  }

  const maxProductosLote =
    maxProductos +
    solicitudes.length *
      (supermercado === "eroski" ? 50 : resultadosPorConsulta);
  const parametros = {
    consultas,
    resultadosPorConsulta,
    maxProductos: maxProductosLote,
  };
  const tipoRastreo = "automatico" as const;

  switch (supermercado) {
    case "eroski": {
      const [{ rastrearLoteEroski }, { guardarRastreoEroski }] =
        await Promise.all([
          import("@/servicios/eroski/rastreo-lote"),
          import("@/servicios/eroski/persistencia-eroski"),
        ]);
      const resultado = await rastrearLoteEroski({
        consultas,
        paginasPorConsulta: paginasEroskiPorConsulta,
        maxProductos: maxProductosLote,
      });
      const persistencia = await guardarRastreoEroski({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteEroski({
            consultas: consultasFallback,
            paginasPorConsulta: 1,
            maxProductos: consultasFallback.length * 50,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoEroski({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "bm": {
      const [{ rastrearLoteBm }, { guardarRastreoBm }] = await Promise.all([
        import("@/servicios/bm/rastreo-lote"),
        import("@/servicios/bm/persistencia-bm"),
      ]);
      const resultado = await rastrearLoteBm(parametros);
      const persistencia = await guardarRastreoBm({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteBm({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoBm({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "mercadona": {
      const [{ rastrearLoteMercadona }, { guardarRastreoMercadona }] =
        await Promise.all([
          import("@/servicios/mercadona/rastreo-lote"),
          import("@/servicios/mercadona/persistencia-mercadona"),
        ]);
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
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteMercadona({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            codigoPostal: codigoPostalMercadona,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoMercadona({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            zona: resultadoFallback.zona,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "aldi": {
      const [{ rastrearLoteAldi }, { guardarRastreoAldi }] =
        await Promise.all([
          import("@/servicios/aldi/rastreo-lote"),
          import("@/servicios/aldi/persistencia-aldi"),
        ]);
      const resultado = await rastrearLoteAldi(parametros);
      const persistencia = await guardarRastreoAldi({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteAldi({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoAldi({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "dia": {
      const [{ rastrearLoteDia }, { guardarRastreoDia }] = await Promise.all([
        import("@/servicios/dia/rastreo-lote"),
        import("@/servicios/dia/persistencia-dia"),
      ]);
      const resultado = await rastrearLoteDia(parametros);
      const persistencia = await guardarRastreoDia({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        codigoPostal: resultado.codigoPostal,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteDia({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoDia({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            codigoPostal: resultadoFallback.codigoPostal,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "lidl": {
      const [{ rastrearLoteLidl }, { guardarRastreoLidl }] =
        await Promise.all([
          import("@/servicios/lidl/rastreo-lote"),
          import("@/servicios/lidl/persistencia-lidl"),
        ]);
      const resultado = await rastrearLoteLidl(parametros);
      const persistencia = await guardarRastreoLidl({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteLidl({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoLidl({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "alcampo": {
      const [{ rastrearLoteAlcampo }, { guardarRastreoAlcampo }] =
        await Promise.all([
          import("@/servicios/alcampo/rastreo-lote"),
          import("@/servicios/alcampo/persistencia-alcampo"),
        ]);
      const resultado = await rastrearLoteAlcampo(parametros);
      const persistencia = await guardarRastreoAlcampo({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        regionId: resultado.regionId,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteAlcampo({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoAlcampo({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            regionId: resultadoFallback.regionId,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "lupa": {
      const [{ rastrearLoteLupa }, { guardarRastreoLupa }] =
        await Promise.all([
          import("@/servicios/lupa/rastreo-lote"),
          import("@/servicios/lupa/persistencia-lupa"),
        ]);
      const resultado = await rastrearLoteLupa(parametros);
      const persistencia = await guardarRastreoLupa({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteLupa({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoLupa({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "coviran": {
      const [{ rastrearLoteCoviran }, { guardarRastreoCoviran }] =
        await Promise.all([
          import("@/servicios/coviran/rastreo-lote"),
          import("@/servicios/coviran/persistencia-coviran"),
        ]);
      const resultado = await rastrearLoteCoviran(parametros);
      const persistencia = await guardarRastreoCoviran({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteCoviran({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoCoviran({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "carrefour": {
      const [{ rastrearLoteCarrefour }, { guardarRastreoCarrefour }] =
        await Promise.all([
          import("@/servicios/carrefour/rastreo-lote"),
          import("@/servicios/carrefour/persistencia-carrefour"),
        ]);
      const resultado = await rastrearLoteCarrefour(parametros);
      const persistencia = await guardarRastreoCarrefour({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteCarrefour({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoCarrefour({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "costco": {
      const [{ rastrearLoteCostco }, { guardarRastreoCostco }] =
        await Promise.all([
          import("@/servicios/costco/rastreo-lote"),
          import("@/servicios/costco/persistencia-costco"),
        ]);
      const resultado = await rastrearLoteCostco(parametros);
      const persistencia = await guardarRastreoCostco({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLoteCostco({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoCostco({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
    }
    case "primaprix": {
      const [{ rastrearLotePrimaprix }, { guardarRastreoPrimaprix }] =
        await Promise.all([
          import("@/servicios/primaprix/rastreo-lote"),
          import("@/servicios/primaprix/persistencia-primaprix"),
        ]);
      const resultado = await rastrearLotePrimaprix(parametros);
      const persistencia = await guardarRastreoPrimaprix({
        productos: resultado.productos,
        consultas,
        errores: resultado.errores,
        tipoRastreo,
      });
      const procesadas = await guardarResultadosSolicitudes(
        supermercado,
        solicitudes,
        resultado,
      );
      const resumen = crearResumen(resultado, persistencia, procesadas);
      const extra = await completarReferencias({
        supermercado,
        desde: inicioActualizacion,
        rastrear: (consultasFallback) =>
          rastrearLotePrimaprix({
            consultas: consultasFallback,
            resultadosPorConsulta,
            maxProductos: consultasFallback.length * resultadosPorConsulta,
            permitirVacio: true,
          }),
        persistir: (productos, resultadoFallback, consultasFallback) =>
          guardarRastreoPrimaprix({
            productos,
            consultas: consultasFallback,
            errores: resultadoFallback.errores,
            tipoRastreo,
          }),
      });
      return sumarReferencias(resumen, extra);
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
