import "server-only";

import { createHmac } from "node:crypto";

import { resolverTerminoRastreo } from "@/servicios/rastreo/resolucion-terminos";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

type ResultadoRpc = {
  solicitud_id: string;
  solicitudes: number;
  estado_actual: string;
  contabilizada: boolean;
};

function obtenerHashSolicitante(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "ip-desconocida";
  const agente = request.headers.get("user-agent")?.slice(0, 300) ?? "";
  const secreto = process.env.ADMIN_RASTREO_TOKEN?.trim();
  if (!secreto || secreto.length < 16) {
    throw new Error(
      "ADMIN_RASTREO_TOKEN debe estar configurado para registrar solicitudes",
    );
  }
  const fechaUtc = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", secreto)
    .update(`${fechaUtc}|${ip}|${agente}`)
    .digest("hex");
}

export async function registrarSolicitudRastreo({
  request,
  termino,
  supermercados,
}: {
  request: Request;
  termino: string;
  supermercados: string[];
}): Promise<{
  registrada: boolean;
  configurada: boolean;
  solicitudId?: string;
  totalSolicitudes?: number;
  contabilizada?: boolean;
}> {
  const terminoResuelto = await resolverTerminoRastreo(termino);
  const terminoNormalizado = terminoResuelto.normalizado;
  if (terminoNormalizado.length < 2) {
    return { registrada: false, configurada: true };
  }

  const supabase = obtenerSupabaseServidor();
  const { data, error } = await supabase.rpc("registrar_solicitud_rastreo", {
    p_termino_original: terminoResuelto.termino,
    p_termino_normalizado: terminoNormalizado,
    p_supermercados: supermercados,
    p_solicitante_hash: obtenerHashSolicitante(request),
  });
  if (error) {
    const sinMigracion =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /registrar_solicitud_rastreo|schema cache/i.test(error.message);
    if (!sinMigracion) {
      console.error("No se pudo registrar la solicitud de rastreo:", error.message);
    }
    return { registrada: false, configurada: !sinMigracion };
  }

  const resultado = (data as ResultadoRpc[] | null)?.[0];
  return {
    registrada: Boolean(resultado),
    configurada: true,
    solicitudId: resultado?.solicitud_id,
    totalSolicitudes: resultado?.solicitudes,
    contabilizada: resultado?.contabilizada,
  };
}
