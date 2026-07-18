import "server-only";

import {
  configuracionAdminValida,
  obtenerCookieSesion,
  validarClaveAdmin,
  validarSesionAdmin,
} from "@/servicios/admin/sesion";

export function autorizarAdmin(request: Request): Response | null {
  if (!configuracionAdminValida()) {
    return Response.json(
      { ok: false, error: "ADMIN_RASTREO_TOKEN no está configurado en el servidor" },
      { status: 503 },
    );
  }

  const sesionValida = validarSesionAdmin(obtenerCookieSesion(request));
  const claveValida = validarClaveAdmin(
    request.headers.get("x-admin-token") ?? "",
  );

  return sesionValida || claveValida
    ? null
    : Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
}
