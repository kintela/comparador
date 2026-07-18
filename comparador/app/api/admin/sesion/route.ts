import { NextResponse } from "next/server";

import {
  configuracionAdminValida,
  COOKIE_SESION_ADMIN,
  crearSesionAdmin,
  DURACION_SESION_ADMIN_SEGUNDOS,
  validarClaveAdmin,
} from "@/servicios/admin/sesion";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!configuracionAdminValida()) {
    return NextResponse.json(
      {
        ok: false,
        error: "ADMIN_RASTREO_TOKEN no está configurado correctamente",
      },
      { status: 503 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "La petición no es válida" },
      { status: 400 },
    );
  }

  const clave =
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "clave" in cuerpo &&
    typeof cuerpo.clave === "string"
      ? cuerpo.clave
      : "";

  if (!validarClaveAdmin(clave)) {
    await new Promise((resolver) => setTimeout(resolver, 500));
    return NextResponse.json(
      { ok: false, error: "Clave incorrecta" },
      { status: 401 },
    );
  }

  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_SESION_ADMIN, crearSesionAdmin(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DURACION_SESION_ADMIN_SEGUNDOS,
  });
  respuesta.headers.set("Cache-Control", "no-store");
  return respuesta;
}

export async function DELETE() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_SESION_ADMIN, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  respuesta.headers.set("Cache-Control", "no-store");
  return respuesta;
}
