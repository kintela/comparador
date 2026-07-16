import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

function obtenerVariable(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export function obtenerSupabaseServidor(): SupabaseClient {
  if (cliente) return cliente;

  const url = obtenerVariable("SUPABASE_URL");
  const clave =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!clave) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY en el servidor",
    );
  }

  cliente = createClient(url, clave, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return cliente;
}
