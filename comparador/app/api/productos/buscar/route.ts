import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductoSupermercadoDb = {
  id: string;
  producto_id: string | null;
  nombre_original: string;
  url_imagen: string | null;
  url_producto: string | null;
  productos: {
    nombre: string;
    marcas: { nombre: string } | null;
    categorias: { nombre: string } | null;
  } | null;
  cadenas_supermercados: { nombre: string } | null;
};

type PrecioDb = {
  producto_supermercado_id: string;
  precio: number;
  precio_promocional: number | null;
  texto_promocion: string | null;
  disponible: boolean;
  fecha_obtencion: string;
  tiendas: {
    id: string;
    nombre: string;
    municipio: string | null;
  } | null;
};

export async function GET(request: Request) {
  const consultaOriginal = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const consulta = consultaOriginal
    .replace(/[^\p{L}\p{N}\s.,-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (consulta.length < 2 || consulta.length > 80) {
    return Response.json(
      { ok: false, error: "La búsqueda debe tener entre 2 y 80 caracteres" },
      { status: 400 },
    );
  }

  try {
    const supabase = obtenerSupabaseServidor();
    const { data, error } = await supabase
      .from("productos_supermercado")
      .select(
        "id, producto_id, nombre_original, url_imagen, url_producto, productos(nombre, marcas(nombre), categorias(nombre)), cadenas_supermercados(nombre)",
      )
      .ilike("nombre_original", `%${consulta}%`)
      .eq("activo", true)
      .limit(60);

    if (error) throw error;

    const productosSupermercado = (data ?? []) as unknown as ProductoSupermercadoDb[];
    if (productosSupermercado.length === 0) {
      return Response.json({ ok: true, consulta, total: 0, productos: [] });
    }

    const ids = productosSupermercado.map((producto) => producto.id);
    const { data: datosPrecios, error: errorPrecios } = await supabase
      .from("precios")
      .select(
        "producto_supermercado_id, precio, precio_promocional, texto_promocion, disponible, fecha_obtencion, tiendas(id, nombre, municipio)",
      )
      .in("producto_supermercado_id", ids)
      .order("fecha_obtencion", { ascending: false });

    if (errorPrecios) throw errorPrecios;

    const ultimoPrecioPorTienda = new Map<string, PrecioDb>();
    for (const precio of (datosPrecios ?? []) as unknown as PrecioDb[]) {
      const clave = `${precio.producto_supermercado_id}:${precio.tiendas?.id ?? "sin-tienda"}`;
      if (!ultimoPrecioPorTienda.has(clave)) ultimoPrecioPorTienda.set(clave, precio);
    }

    const agrupados = new Map<
      string,
      {
        id: string;
        nombre: string;
        imagen: string | null;
        marca: string | null;
        categoria: string | null;
        ofertas: Array<{
          supermercado: string;
          tienda: string;
          municipio: string | null;
          precio: number;
          precioOriginal: number | null;
          textoPromocion: string | null;
          disponible: boolean;
          fechaObtencion: string;
          urlProducto: string | null;
        }>;
      }
    >();

    for (const producto of productosSupermercado) {
      const claveProducto = producto.producto_id ?? producto.id;
      const agrupado = agrupados.get(claveProducto) ?? {
        id: claveProducto,
        nombre: producto.productos?.nombre ?? producto.nombre_original,
        imagen: producto.url_imagen,
        marca: producto.productos?.marcas?.nombre ?? null,
        categoria: producto.productos?.categorias?.nombre ?? null,
        ofertas: [],
      };

      for (const precio of ultimoPrecioPorTienda.values()) {
        if (precio.producto_supermercado_id !== producto.id) continue;
        agrupado.ofertas.push({
          supermercado: producto.cadenas_supermercados?.nombre ?? "Supermercado",
          tienda: precio.tiendas?.nombre ?? "Tienda online",
          municipio: precio.tiendas?.municipio ?? null,
          precio: Number(precio.precio_promocional ?? precio.precio),
          precioOriginal: precio.precio_promocional ? Number(precio.precio) : null,
          textoPromocion: precio.texto_promocion,
          disponible: precio.disponible,
          fechaObtencion: precio.fecha_obtencion,
          urlProducto: producto.url_producto,
        });
      }

      agrupado.ofertas.sort((a, b) => a.precio - b.precio);
      agrupados.set(claveProducto, agrupado);
    }

    const productos = [...agrupados.values()]
      .filter((producto) => producto.ofertas.length > 0)
      .sort((a, b) => (a.ofertas[0]?.precio ?? Infinity) - (b.ofertas[0]?.precio ?? Infinity))
      .slice(0, 20);

    return Response.json({ ok: true, consulta, total: productos.length, productos });
  } catch (error) {
    console.error(
      "Error al buscar productos:",
      error instanceof Error ? error.message : "Error desconocido",
    );
    return Response.json(
      { ok: false, error: "No se pudieron consultar los productos" },
      { status: 500 },
    );
  }
}
