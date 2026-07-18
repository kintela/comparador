import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FormularioAccesoAdmin } from "@/app/acceso-admin/formulario-acceso";
import {
  COOKIE_SESION_ADMIN,
  validarSesionAdmin,
} from "@/servicios/admin/sesion";

export const dynamic = "force-dynamic";

export default async function AccesoAdmin() {
  const almacenCookies = await cookies();
  if (
    validarSesionAdmin(almacenCookies.get(COOKIE_SESION_ADMIN)?.value)
  ) {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-400">
          Comparador · Administración
        </p>
        <h1 className="mt-3 text-3xl font-bold">Acceso privado</h1>
        <p className="mt-3 leading-7 text-slate-400">
          Introduce la clave una sola vez. La sesión permanecerá activa durante
          12 horas en este navegador.
        </p>
        <FormularioAccesoAdmin />
      </div>
    </main>
  );
}
