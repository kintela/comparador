import "server-only";

import { timingSafeEqual } from "node:crypto";

export function autorizarAdmin(request: Request): Response | null {
  const esperado = process.env.ADMIN_RASTREO_TOKEN?.trim();
  if (!esperado || esperado.length < 16) {
    return Response.json(
      { ok: false, error: "ADMIN_RASTREO_TOKEN no está configurado en el servidor" },
      { status: 503 },
    );
  }

  const recibido = request.headers.get("x-admin-token") ?? "";
  const bufferEsperado = Buffer.from(esperado);
  const bufferRecibido = Buffer.from(recibido);
  const valido =
    bufferEsperado.length === bufferRecibido.length &&
    timingSafeEqual(bufferEsperado, bufferRecibido);

  return valido
    ? null
    : Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
}
