import { CONFIGURACION_RASTREO_AUTOMATICO } from "@/servicios/rastreo/configuracion";
import { rastrearLoteEroski } from "@/servicios/eroski/rastreo-lote";

const origen = (
  process.env.COMPARADOR_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const secreto = process.env.CRON_SECRET?.trim();
if (!secreto) throw new Error("Falta la variable de entorno CRON_SECRET");
const autorizacion = { Authorization: `Bearer ${secreto}` };

async function ejecutar() {
  const respuestaConfiguracion = await fetch(
    `${origen}/api/cron/importar/eroski`,
    { headers: autorizacion },
  );
  if (!respuestaConfiguracion.ok) {
    throw new Error(
      `No se pudo obtener la configuración (${respuestaConfiguracion.status})`,
    );
  }
  const configuracion = (await respuestaConfiguracion.json()) as {
    consultas: string[];
  };
  const consultasEntorno = process.env.RASTREO_EROSKI_CONSULTAS?.split(",")
    .map((termino) => termino.trim())
    .filter(Boolean);
  const consultas = consultasEntorno?.length
    ? consultasEntorno
    : configuracion.consultas;
  const paginasPorConsulta = Number(
    process.env.RASTREO_EROSKI_PAGINAS ??
      CONFIGURACION_RASTREO_AUTOMATICO.paginasEroskiPorConsulta,
  );
  const resultado = await rastrearLoteEroski({
    consultas,
    paginasPorConsulta,
    maxProductos: CONFIGURACION_RASTREO_AUTOMATICO.maxProductos,
  });
  const respuestaGuardado = await fetch(`${origen}/api/cron/importar/eroski`, {
    method: "POST",
    headers: { ...autorizacion, "Content-Type": "application/json" },
    body: JSON.stringify({ consultas, resultado }),
  });
  const resumen = (await respuestaGuardado.json()) as {
    error?: string;
    productos?: number;
    errores?: number;
    precios?: number;
  };
  if (!respuestaGuardado.ok) {
    throw new Error(resumen.error ?? "No se pudo guardar el rastreo");
  }
  console.log(JSON.stringify({ ok: true, ...resumen }));
}

ejecutar().catch(async (error) => {
  const mensaje = error instanceof Error ? error.message : "Error desconocido";
  await fetch(`${origen}/api/cron/importar/eroski`, {
    method: "POST",
    headers: { ...autorizacion, "Content-Type": "application/json" },
    body: JSON.stringify({ error: mensaje }),
  }).catch(() => undefined);
  console.error(mensaje);
  process.exitCode = 1;
});
