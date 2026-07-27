import "server-only";

import {
  enviarCorreo,
  obtenerDestinatarioInformeOfertas,
} from "@/servicios/email/smtp";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

const ZONA_HORARIA = "Europe/Madrid";
const MAX_OFERTAS_POR_SUPERMERCADO = 12;
const SUPERMERCADOS = [
  "Alcampo",
  "ALDI",
  "BM Supermercados",
  "Carrefour",
  "Costco",
  "Covirán",
  "DIA",
  "El Corte Inglés",
  "Eroski",
  "Lidl",
  "Lupa",
  "Mercadona",
  "Primaprix",
] as const;

type PrecioDb = {
  producto_supermercado_id: string;
  precio: number;
  precio_promocional: number | null;
  texto_promocion: string | null;
  fecha_inicio_promocion: string | null;
  fecha_fin_promocion: string | null;
  disponible: boolean;
  fecha_obtencion: string;
  tiendas: {
    id: string;
    nombre: string;
  } | null;
  productos_supermercado: {
    nombre_original: string;
    url_producto: string | null;
    cadenas_supermercados: {
      nombre: string;
    } | null;
  } | null;
};

type OfertaInforme = {
  supermercado: string;
  producto: string;
  precio: number;
  precioOriginal: number | null;
  textoPromocion: string | null;
  url: string | null;
};

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

function partesFechaMadrid(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: Number(valor("hour")),
  };
}

export function fechaInformeOfertasMadrid(fecha = new Date()): string {
  return partesFechaMadrid(fecha).fecha;
}

export function esHoraInformeOfertas(fecha = new Date()): boolean {
  return partesFechaMadrid(fecha).hora >= 9;
}

function formatoEuros(valor: number): string {
  return valor.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}

function crearHtml(fecha: string, ofertas: OfertaInforme[]): string {
  const secciones = SUPERMERCADOS.map((supermercado) => {
    const ofertasSupermercado = ofertas
      .filter((oferta) => oferta.supermercado === supermercado)
      .slice(0, MAX_OFERTAS_POR_SUPERMERCADO);

    const contenido =
      ofertasSupermercado.length === 0
        ? `<p style="margin:0;color:#64748b">No se detectaron ofertas vigentes en el rastreo de esta mañana.</p>`
        : `<table style="width:100%;border-collapse:collapse">
            <tbody>
              ${ofertasSupermercado
                .map(
                  (oferta) => `
                    <tr>
                      <td style="padding:11px 0;border-bottom:1px solid #e5e7eb">
                        ${
                          oferta.url
                            ? `<a href="${escaparHtml(oferta.url)}" style="color:#17352b;font-weight:700;text-decoration:none">${escaparHtml(oferta.producto)}</a>`
                            : `<span style="font-weight:700">${escaparHtml(oferta.producto)}</span>`
                        }
                        ${
                          oferta.textoPromocion
                            ? `<div style="margin-top:4px;color:#b45309;font-size:13px">${escaparHtml(oferta.textoPromocion)}</div>`
                            : ""
                        }
                      </td>
                      <td style="padding:11px 0 11px 16px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">
                        ${
                          oferta.precioOriginal
                            ? `<span style="margin-right:7px;color:#94a3b8;text-decoration:line-through">${formatoEuros(oferta.precioOriginal)}</span>`
                            : ""
                        }
                        <strong style="color:#047857">${formatoEuros(oferta.precio)}</strong>
                      </td>
                    </tr>`,
                )
                .join("")}
            </tbody>
          </table>`;

    return `
      <section style="margin-top:18px;padding:20px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
        <h2 style="margin:0 0 14px;font-size:19px">${escaparHtml(supermercado)}</h2>
        ${contenido}
      </section>`;
  }).join("");

  return `<!doctype html>
  <html lang="es">
    <body style="margin:0;background:#f5f3ed;font-family:Arial,sans-serif;color:#17352b">
      <div style="max-width:760px;margin:0 auto;padding:28px 16px">
        <p style="margin:0;color:#047857;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Comparador de precios</p>
        <h1 style="margin:9px 0 5px;font-size:28px">Ofertas de esta mañana</h1>
        <p style="margin:0 0 20px;color:#64748b">${escaparHtml(fecha)} · ${ofertas.length} ofertas vigentes detectadas</p>
        ${secciones}
        <p style="margin:22px 4px 0;color:#64748b;font-size:12px;line-height:1.5">Los precios y la disponibilidad pueden variar según la tienda y la zona de entrega. Se muestran hasta ${MAX_OFERTAS_POR_SUPERMERCADO} ofertas por supermercado.</p>
      </div>
    </body>
  </html>`;
}

function crearTexto(fecha: string, ofertas: OfertaInforme[]): string {
  return [
    `Ofertas de esta mañana — ${fecha}`,
    "",
    ...SUPERMERCADOS.flatMap((supermercado) => {
      const ofertasSupermercado = ofertas
        .filter((oferta) => oferta.supermercado === supermercado)
        .slice(0, MAX_OFERTAS_POR_SUPERMERCADO);
      return [
        supermercado,
        ...(ofertasSupermercado.length > 0
          ? ofertasSupermercado.map(
              (oferta) =>
                `- ${oferta.producto}: ${formatoEuros(oferta.precio)}${oferta.precioOriginal ? ` (antes ${formatoEuros(oferta.precioOriginal)})` : ""}${oferta.textoPromocion ? ` · ${oferta.textoPromocion}` : ""}${oferta.url ? ` · ${oferta.url}` : ""}`,
            )
          : ["- Sin ofertas vigentes detectadas"]),
        "",
      ];
    }),
  ].join("\n");
}

async function obtenerOfertasVigentes(ahora: Date): Promise<OfertaInforme[]> {
  const supabase = obtenerSupabaseServidor();
  const desde = new Date(ahora.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const filas: PrecioDb[] = [];

  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("precios")
      .select(
        "producto_supermercado_id, precio, precio_promocional, texto_promocion, fecha_inicio_promocion, fecha_fin_promocion, disponible, fecha_obtencion, tiendas(id, nombre), productos_supermercado(nombre_original, url_producto, cadenas_supermercados(nombre))",
      )
      .gte("fecha_obtencion", desde)
      .order("fecha_obtencion", { ascending: false })
      .range(inicio, inicio + 999);
    if (error) {
      throw new Error(`No se pudieron consultar las ofertas: ${error.message}`);
    }

    const pagina = (data ?? []) as unknown as PrecioDb[];
    filas.push(...pagina);
    if (pagina.length < 1000) break;
  }

  const ultimoPrecio = new Map<string, PrecioDb>();
  for (const fila of filas) {
    const clave = `${fila.producto_supermercado_id}:${fila.tiendas?.id ?? "sin-tienda"}`;
    if (!ultimoPrecio.has(clave)) ultimoPrecio.set(clave, fila);
  }

  const instante = ahora.getTime();
  return [...ultimoPrecio.values()]
    .filter((fila) => fila.disponible)
    .filter((fila) => {
      const tieneOferta =
        fila.precio_promocional !== null || Boolean(fila.texto_promocion);
      const iniciada =
        !fila.fecha_inicio_promocion ||
        new Date(fila.fecha_inicio_promocion).getTime() <= instante;
      const noCaducada =
        !fila.fecha_fin_promocion ||
        new Date(fila.fecha_fin_promocion).getTime() >= instante;
      return tieneOferta && iniciada && noCaducada;
    })
    .map((fila) => ({
      supermercado:
        fila.productos_supermercado?.cadenas_supermercados?.nombre ??
        "Supermercado",
      producto:
        fila.productos_supermercado?.nombre_original ?? "Producto sin nombre",
      precio: Number(fila.precio_promocional ?? fila.precio),
      precioOriginal:
        fila.precio_promocional === null ? null : Number(fila.precio),
      textoPromocion: fila.texto_promocion,
      url: fila.productos_supermercado?.url_producto ?? null,
    }))
    .sort((a, b) => {
      const descuentoA =
        a.precioOriginal && a.precioOriginal > 0
          ? (a.precioOriginal - a.precio) / a.precioOriginal
          : 0;
      const descuentoB =
        b.precioOriginal && b.precioOriginal > 0
          ? (b.precioOriginal - b.precio) / b.precioOriginal
          : 0;
      return descuentoB - descuentoA || a.precio - b.precio;
    });
}

export async function crearYEnviarInformeOfertas(): Promise<{
  fecha: string;
  destinatario: string;
  messageId: string;
  ofertasIncluidas: number;
}> {
  const ahora = new Date();
  const fecha = fechaInformeOfertasMadrid(ahora);
  const fechaLocal = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeZone: ZONA_HORARIA,
  }).format(ahora);
  const ofertas = await obtenerOfertasVigentes(ahora);
  const destinatario = obtenerDestinatarioInformeOfertas();
  const { messageId } = await enviarCorreo({
    destinatario,
    asunto: `Ofertas del día · ${fechaLocal}`,
    texto: crearTexto(fechaLocal, ofertas),
    html: crearHtml(fechaLocal, ofertas),
  });

  return {
    fecha,
    destinatario,
    messageId,
    ofertasIncluidas: ofertas.length,
  };
}
