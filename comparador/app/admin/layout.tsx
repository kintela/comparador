import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { BotonCerrarSesion } from "@/app/admin/boton-cerrar-sesion";
import {
  COOKIE_SESION_ADMIN,
  validarSesionAdmin,
} from "@/servicios/admin/sesion";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const almacenCookies = await cookies();
  if (
    !validarSesionAdmin(almacenCookies.get(COOKIE_SESION_ADMIN)?.value)
  ) {
    redirect("/acceso-admin");
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <BotonCerrarSesion />
      </div>
      {children}
    </>
  );
}
