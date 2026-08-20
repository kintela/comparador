import { enviarCorreo } from "@/servicios/email/smtp";
import {
  crearCorreoListaCompra,
  validarListaCompraCorreo,
} from "@/servicios/email/lista-compra";
import { esDireccionCorreoValida } from "@/servicios/email/validacion-correo";

export const runtime = "nodejs";

const LIMITE_BYTES = 100_000;
const VENTANA_MS = 15 * 60 * 1_000;
const MAXIMO_ENVIOS = 5;
const intentosPorOrigen = new Map<string, number[]>();

function origenPermitido(request: Request) {
  const origen = request.headers.get("origin");
  return origen !== null && origen === new URL(request.url).origin;
}

function identificadorOrigen(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "origen-desconocido"
  );
}

function superaLimite(request: Request) {
  const ahora = Date.now();
  const identificador = identificadorOrigen(request);
  const recientes = (intentosPorOrigen.get(identificador) ?? []).filter(
    (instante) => ahora - instante < VENTANA_MS,
  );
  if (recientes.length >= MAXIMO_ENVIOS) return true;
  recientes.push(ahora);
  intentosPorOrigen.set(identificador, recientes);
  return false;
}

export async function POST(request: Request) {
  if (!origenPermitido(request)) {
    return Response.json({ ok: false, error: "Origen no permitido." }, { status: 403 });
  }
  const longitud = Number(request.headers.get("content-length") ?? 0);
  if (longitud > LIMITE_BYTES) {
    return Response.json({ ok: false, error: "La lista es demasiado grande." }, { status: 413 });
  }

  let entrada: unknown;
  try {
    entrada = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Solicitud no válida." }, { status: 400 });
  }
  if (JSON.stringify(entrada).length > LIMITE_BYTES) {
    return Response.json({ ok: false, error: "La lista es demasiado grande." }, { status: 413 });
  }
  if (!entrada || typeof entrada !== "object") {
    return Response.json({ ok: false, error: "Solicitud no válida." }, { status: 400 });
  }
  const cuerpo = entrada as Record<string, unknown>;
  const destinatario =
    typeof cuerpo.destinatario === "string" ? cuerpo.destinatario.trim() : cuerpo.destinatario;
  const lista = validarListaCompraCorreo(cuerpo.lista);
  if (!esDireccionCorreoValida(destinatario) || !lista) {
    return Response.json(
      { ok: false, error: "Revisa la dirección y el contenido de la lista." },
      { status: 400 },
    );
  }
  if (superaLimite(request)) {
    return Response.json(
      { ok: false, error: "Has realizado demasiados envíos. Inténtalo de nuevo más tarde." },
      { status: 429 },
    );
  }

  const correo = crearCorreoListaCompra(lista);
  try {
    await enviarCorreo({
      destinatario,
      asunto: "Tu lista de la compra comparada",
      texto: correo.texto,
      html: correo.html,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("No se pudo enviar la lista de la compra:", error);
    return Response.json(
      { ok: false, error: "No se pudo enviar el correo. Inténtalo de nuevo." },
      { status: 502 },
    );
  }
}
