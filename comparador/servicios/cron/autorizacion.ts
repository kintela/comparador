import "server-only";

import { timingSafeEqual } from "node:crypto";

export function autorizarCron(request: Request): Response | null {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto || secreto.length < 16) {
    return Response.json(
      { ok: false, error: "CRON_SECRET no está configurado en el servidor" },
      { status: 503 },
    );
  }

  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  const autorizado =
    esperado.length === recibido.length && timingSafeEqual(esperado, recibido);

  return autorizado
    ? null
    : Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
}
