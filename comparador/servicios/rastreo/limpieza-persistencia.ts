import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export function tienePrecioUtil(precio: number): boolean {
  return Number.isFinite(precio) && precio > 0;
}

export async function revertirAltasSinPrecio({
  supabase,
  productosIds,
  referenciasIds,
}: {
  supabase: SupabaseClient;
  productosIds: string[];
  referenciasIds: string[];
}): Promise<void> {
  if (productosIds.length > 0) {
    const { error } = await supabase
      .from("productos_supermercado")
      .update({ producto_id: null })
      .in("producto_id", productosIds);
    if (error) throw error;
  }

  if (referenciasIds.length > 0) {
    const { error } = await supabase
      .from("productos_supermercado")
      .delete()
      .in("id", referenciasIds);
    if (error) throw error;
  }

  if (productosIds.length > 0) {
    const { error } = await supabase
      .from("productos")
      .delete()
      .in("id", productosIds);
    if (error) throw error;
  }
}
