import "server-only";

import {
  enviarCorreo,
  obtenerDestinatarioInformeTecnico,
} from "@/servicios/email/smtp";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

const SUPERMERCADOS = [
  { slug: "eroski", nombre: "Eroski" },
  { slug: "bm-supermercados", nombre: "BM Supermercados" },
  { slug: "mercadona", nombre: "Mercadona" },
  { slug: "aldi", nombre: "ALDI" },
  { slug: "dia", nombre: "DIA" },
  { slug: "lidl", nombre: "Lidl" },
  { slug: "alcampo", nombre: "Alcampo" },
  { slug: "lupa", nombre: "Lupa" },
  { slug: "coviran", nombre: "Covirán" },
  { slug: "carrefour", nombre: "Carrefour" },
  { slug: "costco", nombre: "Costco" },
  { slug: "primaprix", nombre: "Primaprix" },
  { slug: "el-corte-ingles", nombre: "El Corte Inglés" },
] as const;

type EjecucionDb = {
  id: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  productos_detectados: number | null;
  productos_nuevos: number | null;
  precios_insertados: number | null;
  errores_detectados: number | null;
  mensaje_error: string | null;
  cadenas_supermercados: {
    slug: string;
    nombre: string;
  } | null;
};

type FilaInforme = {
  supermercado: string;
  estado: string;
  inicio: string | null;
  duracionSegundos: number | null;
  productos: number;
  productosNuevos: number;
  precios: number;
  errores: number;
  mensaje: string | null;
};

const VENTANA_MISMO_RASTREO_MS = 5 * 60 * 1000;

function agruparUltimoRastreo(ejecuciones: EjecucionDb[]): EjecucionDb[] {
  const ordenadas = [...ejecuciones].sort(
    (a, b) =>
      new Date(b.fecha_inicio).getTime() - new Date(a.fecha_inicio).getTime(),
  );
  if (ordenadas.length === 0) return [];
  const grupo = [ordenadas[0]];
  for (let indice = 1; indice < ordenadas.length; indice += 1) {
    const posterior = new Date(ordenadas[indice - 1].fecha_inicio).getTime();
    const anterior = new Date(ordenadas[indice].fecha_inicio).getTime();
    if (posterior - anterior > VENTANA_MISMO_RASTREO_MS) break;
    grupo.push(ordenadas[indice]);
  }
  return grupo;
}

function estadoAgrupado(ejecuciones: EjecucionDb[]): string {
  if (ejecuciones.some((ejecucion) => ejecucion.estado === "error")) {
    return "error";
  }
  if (ejecuciones.some((ejecucion) => ejecucion.estado === "en_proceso")) {
    return "en_proceso";
  }
  if (
    ejecuciones.some(
      (ejecucion) => ejecucion.estado === "completado_con_errores",
    )
  ) {
    return "completado_con_errores";
  }
  return "completado";
}

function escaparHtml(valor: string): string {
  return valor.replace(
    /[&<>"']/g,
    (caracter) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[caracter] ?? caracter,
  );
}

function formatoFecha(fecha: string | null): string {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(fecha));
}

function formatoDuracion(segundos: number | null): string {
  if (segundos === null) return "—";
  if (segundos < 60) return `${segundos} s`;
  return `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}

function etiquetaEstado(estado: string): string {
  const etiquetas: Record<string, string> = {
    completado: "Completado",
    completado_con_errores: "Completado con errores",
    error: "Error",
    en_proceso: "En proceso",
    sin_ejecucion: "Sin ejecución",
  };
  return etiquetas[estado] ?? estado;
}

function colorEstado(estado: string): string {
  if (estado === "completado") return "#047857";
  if (estado === "completado_con_errores") return "#b45309";
  return "#b91c1c";
}

function crearHtml(fecha: string, filas: FilaInforme[]): string {
  const correctos = filas.filter((fila) => fila.estado === "completado").length;
  const productos = filas.reduce((total, fila) => total + fila.productos, 0);
  const precios = filas.reduce((total, fila) => total + fila.precios, 0);
  const errores = filas.reduce((total, fila) => total + fila.errores, 0);

  const cuerpo = filas
    .map(
      (fila) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-weight:600">${escaparHtml(fila.supermercado)}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;color:${colorEstado(fila.estado)};font-weight:600">${escaparHtml(etiquetaEstado(fila.estado))}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb">${formatoFecha(fila.inicio)}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb">${formatoDuracion(fila.duracionSegundos)}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${fila.productos}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${fila.productosNuevos}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${fila.precios}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${fila.errores}</td>
        </tr>
        ${
          fila.mensaje
            ? `<tr><td colspan="8" style="padding:0 12px 12px;color:#b91c1c;font-size:13px">${escaparHtml(fila.mensaje)}</td></tr>`
            : ""
        }`,
    )
    .join("");

  return `<!doctype html>
  <html lang="es">
    <body style="margin:0;background:#f5f3ed;font-family:Arial,sans-serif;color:#16352c">
      <div style="max-width:960px;margin:0 auto;padding:32px 18px">
        <div style="background:#ffffff;border-radius:16px;padding:28px">
          <p style="margin:0;color:#047857;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Comparador de precios</p>
          <h1 style="margin:10px 0 6px;font-size:28px">Informe diario de rastreos</h1>
          <p style="margin:0 0 24px;color:#64748b">Ejecuciones automáticas del ${escaparHtml(fecha)}.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
            <span style="padding:10px 14px;background:#ecfdf5;border-radius:10px"><strong>${correctos}/${SUPERMERCADOS.length}</strong> completados sin errores</span>
            <span style="padding:10px 14px;background:#f8fafc;border-radius:10px"><strong>${productos}</strong> productos</span>
            <span style="padding:10px 14px;background:#f8fafc;border-radius:10px"><strong>${precios}</strong> precios</span>
            <span style="padding:10px 14px;background:#f8fafc;border-radius:10px"><strong>${errores}</strong> errores</span>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <thead>
                <tr style="background:#f8fafc;color:#475569;text-align:left">
                  <th style="padding:12px">Supermercado</th>
                  <th style="padding:12px">Estado</th>
                  <th style="padding:12px">Inicio</th>
                  <th style="padding:12px">Duración</th>
                  <th style="padding:12px;text-align:right">Productos</th>
                  <th style="padding:12px;text-align:right">Nuevos</th>
                  <th style="padding:12px;text-align:right">Precios</th>
                  <th style="padding:12px;text-align:right">Errores</th>
                </tr>
              </thead>
              <tbody>${cuerpo}</tbody>
            </table>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

function crearTexto(fecha: string, filas: FilaInforme[]): string {
  return [
    `Informe diario de rastreos — ${fecha}`,
    "",
    ...filas.map(
      (fila) =>
        `${fila.supermercado}: ${etiquetaEstado(fila.estado)} | productos ${fila.productos} | nuevos ${fila.productosNuevos} | precios ${fila.precios} | errores ${fila.errores}${fila.mensaje ? ` | ${fila.mensaje}` : ""}`,
    ),
  ].join("\n");
}

export function fechaInformeUtc(fecha = new Date()): string {
  return fecha.toISOString().slice(0, 10);
}

export async function crearYEnviarInformeRastreos(): Promise<{
  fecha: string;
  destinatario: string;
  messageId: string;
  ejecucionesIncluidas: number;
}> {
  const ahora = new Date();
  const fecha = fechaInformeUtc(ahora);
  const inicio = `${fecha}T00:00:00.000Z`;
  const supabase = obtenerSupabaseServidor();
  const { data, error } = await supabase
    .from("ejecuciones_rastreo")
    .select(
      "id, estado, fecha_inicio, fecha_fin, productos_detectados, productos_nuevos, precios_insertados, errores_detectados, mensaje_error, cadenas_supermercados(slug, nombre)",
    )
    .eq("tipo_rastreo", "automatico")
    .gte("fecha_inicio", inicio)
    .lte("fecha_inicio", ahora.toISOString())
    .order("fecha_inicio", { ascending: false });
  if (error) throw new Error(`No se pudieron consultar los rastreos: ${error.message}`);

  const ejecuciones = (data ?? []) as unknown as EjecucionDb[];
  const ejecucionesPorCadena = new Map<string, EjecucionDb[]>();
  for (const ejecucion of ejecuciones) {
    const slug = ejecucion.cadenas_supermercados?.slug;
    if (!slug) continue;
    const acumuladas = ejecucionesPorCadena.get(slug) ?? [];
    acumuladas.push(ejecucion);
    ejecucionesPorCadena.set(slug, acumuladas);
  }

  const filas: FilaInforme[] = SUPERMERCADOS.map((supermercado) => {
    const grupo = agruparUltimoRastreo(
      ejecucionesPorCadena.get(supermercado.slug) ?? [],
    );
    if (grupo.length === 0) {
      return {
        supermercado: supermercado.nombre,
        estado: "sin_ejecucion",
        inicio: null,
        duracionSegundos: null,
        productos: 0,
        productosNuevos: 0,
        precios: 0,
        errores: 0,
        mensaje: "No se registró ninguna ejecución automática hoy.",
      };
    }

    const inicioGrupo = grupo.reduce((menor, ejecucion) =>
      new Date(ejecucion.fecha_inicio) < new Date(menor.fecha_inicio)
        ? ejecucion
        : menor,
    );
    const finGrupo = grupo
      .filter((ejecucion) => ejecucion.fecha_fin)
      .reduce<EjecucionDb | null>(
        (mayor, ejecucion) =>
          !mayor ||
          new Date(ejecucion.fecha_fin ?? 0) > new Date(mayor.fecha_fin ?? 0)
            ? ejecucion
            : mayor,
        null,
      );
    const duracionSegundos = finGrupo?.fecha_fin
      ? Math.max(
          0,
          Math.round(
            (new Date(finGrupo.fecha_fin).getTime() -
              new Date(inicioGrupo.fecha_inicio).getTime()) /
              1000,
          ),
        )
      : null;
    const mensajes = [
      ...new Set(
        grupo
          .map((ejecucion) => ejecucion.mensaje_error?.trim())
          .filter((mensaje): mensaje is string => Boolean(mensaje)),
      ),
    ];
    return {
      supermercado:
        inicioGrupo.cadenas_supermercados?.nombre ?? supermercado.nombre,
      estado: estadoAgrupado(grupo),
      inicio: inicioGrupo.fecha_inicio,
      duracionSegundos,
      productos: grupo.reduce(
        (total, ejecucion) => total + (ejecucion.productos_detectados ?? 0),
        0,
      ),
      productosNuevos: grupo.reduce(
        (total, ejecucion) => total + (ejecucion.productos_nuevos ?? 0),
        0,
      ),
      precios: grupo.reduce(
        (total, ejecucion) => total + (ejecucion.precios_insertados ?? 0),
        0,
      ),
      errores: grupo.reduce(
        (total, ejecucion) => total + (ejecucion.errores_detectados ?? 0),
        0,
      ),
      mensaje: mensajes.length > 0 ? mensajes.join(" · ") : null,
    };
  });

  const fechaLocal = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeZone: "Europe/Madrid",
  }).format(ahora);
  const tieneIncidencias = filas.some((fila) => fila.estado !== "completado");
  const destinatario = obtenerDestinatarioInformeTecnico();
  const { messageId } = await enviarCorreo({
    destinatario,
    asunto: `${tieneIncidencias ? "⚠️ " : ""}Informe de rastreos · ${fechaLocal}`,
    texto: crearTexto(fechaLocal, filas),
    html: crearHtml(fechaLocal, filas),
  });

  return {
    fecha,
    destinatario,
    messageId,
    ejecucionesIncluidas: ejecuciones.length,
  };
}
