import "server-only";

import { randomUUID } from "node:crypto";

import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export type BloqueoRastreo = {
  clave: string;
  token: string;
};

export async function adquirirBloqueoRastreo(
  supermercado: string,
): Promise<BloqueoRastreo | null> {
  const bloqueo = {
    clave: `rastreo:${supermercado}`,
    token: randomUUID(),
  };
  const { data, error } = await obtenerSupabaseServidor().rpc(
    "adquirir_bloqueo_rastreo",
    {
      p_clave: bloqueo.clave,
      p_token: bloqueo.token,
      p_duracion_segundos: 900,
    },
  );

  if (error) {
    throw new Error(`No se pudo adquirir el bloqueo: ${error.message}`);
  }
  return data === true ? bloqueo : null;
}

export async function liberarBloqueoRastreo(
  bloqueo: BloqueoRastreo,
): Promise<void> {
  const { error } = await obtenerSupabaseServidor().rpc(
    "liberar_bloqueo_rastreo",
    {
      p_clave: bloqueo.clave,
      p_token: bloqueo.token,
    },
  );
  if (error) {
    throw new Error(`No se pudo liberar el bloqueo: ${error.message}`);
  }
}

export async function ejecutarConBloqueoRastreo(
  supermercado: string,
  tarea: () => Promise<Response>,
): Promise<Response> {
  const bloqueo = await adquirirBloqueoRastreo(supermercado);
  if (!bloqueo) {
    return Response.json(
      { ok: false, error: "Ya existe un rastreo de este supermercado en curso" },
      { status: 409 },
    );
  }

  try {
    return await tarea();
  } finally {
    await liberarBloqueoRastreo(bloqueo).catch((error) => {
      console.error(`No se liberó el bloqueo de ${supermercado}:`, error);
    });
  }
}
