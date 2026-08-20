import {
  adquirirBloqueoRastreo,
  liberarBloqueoRastreo,
} from "@/servicios/rastreo/bloqueo";
import { CONFIGURACION_RASTREO_AUTOMATICO } from "@/servicios/rastreo/configuracion";
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
import { guardarRastreoEroski } from "@/servicios/eroski/persistencia-eroski";
import { rastrearLoteEroski } from "@/servicios/eroski/rastreo-lote";

const SUPERMERCADO = "eroski" as const;

async function ejecutar() {
  const inicio = new Date().toISOString();
  const bloqueo = await adquirirBloqueoRastreo(SUPERMERCADO);
  if (!bloqueo) throw new Error("Ya existe un rastreo de Eroski en curso");

  try {
    const [solicitudes, terminosConfigurados] = await Promise.all([
      obtenerSolicitudesAutomaticas(SUPERMERCADO),
      obtenerTerminosRastreo(SUPERMERCADO),
    ]);
    const terminosEntorno = process.env.RASTREO_EROSKI_CONSULTAS?.split(",")
      .map((termino) => termino.trim())
      .filter(Boolean);
    const terminos = terminosEntorno?.length
      ? terminosEntorno
      : terminosConfigurados;
    const consultasUnicas = new Map<string, string>();
    for (const consulta of [
      ...solicitudes.map((solicitud) => solicitud.termino),
      ...terminos,
    ]) {
      const normalizada = normalizarTerminoRastreo(consulta);
      if (normalizada && !consultasUnicas.has(normalizada)) {
        consultasUnicas.set(normalizada, consulta);
      }
    }
    const consultas = [...consultasUnicas.values()];
    if (consultas.length === 0) throw new Error("No hay términos para Eroski");

    const paginasPorConsulta = Number(
      process.env.RASTREO_EROSKI_PAGINAS ??
        CONFIGURACION_RASTREO_AUTOMATICO.paginasEroskiPorConsulta,
    );
    const resultado = await rastrearLoteEroski({
      consultas,
      paginasPorConsulta,
      maxProductos:
        CONFIGURACION_RASTREO_AUTOMATICO.maxProductos +
        solicitudes.length * 50,
    });
    const persistencia = await guardarRastreoEroski({
      productos: resultado.productos,
      consultas,
      errores: resultado.errores,
      tipoRastreo: "automatico",
    });

    for (const solicitud of solicitudes) {
      if (!(solicitud.termino in resultado.resultadosPorConsulta)) continue;
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
        supermercado: SUPERMERCADO,
        productosEncontrados,
        error,
      });
    }

    console.log(
      JSON.stringify({
        ok: true,
        productos: resultado.productos.length,
        errores: resultado.errores.length,
        precios: persistencia.preciosInsertados,
      }),
    );
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    await registrarFalloRastreoAutomatico(SUPERMERCADO, mensaje, inicio);
    throw error;
  } finally {
    await liberarBloqueoRastreo(bloqueo);
  }
}

ejecutar().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
