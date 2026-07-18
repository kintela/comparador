import { autorizarAdmin } from "@/servicios/admin/autorizacion";
import {
  normalizarTerminoRastreo,
  SUPERMERCADOS_RASTREO,
  type SupermercadoRastreo,
} from "@/servicios/rastreo/terminos";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCTOS_POR_PAGINA = 24;

function enteroPositivo(valor: string | null, predeterminado: number): number {
  if (!valor || !/^\d+$/.test(valor)) return predeterminado;
  return Math.max(1, Number.parseInt(valor, 10));
}

function supermercadosValidos(valor: unknown): SupermercadoRastreo[] | null {
  if (!Array.isArray(valor)) return null;
  const unicos = [
    ...new Set(
      valor.filter(
        (item): item is SupermercadoRastreo =>
          typeof item === "string" &&
          SUPERMERCADOS_RASTREO.includes(item as SupermercadoRastreo),
      ),
    ),
  ];
  return unicos.length === valor.length ? unicos : null;
}

async function cargarContextoCatalogo() {
  const supabase = obtenerSupabaseServidor();
  const [cadenas, totalProductos] = await Promise.all([
    supabase
      .from("cadenas_supermercados")
      .select("id, nombre, slug")
      .eq("activa", true)
      .order("nombre"),
    supabase
      .from("productos")
      .select(
        "id, productos_supermercado!inner(precios!inner())",
        { count: "exact", head: true },
      )
      .eq("productos_supermercado.activo", true),
  ]);

  const error = cadenas.error ?? totalProductos.error;
  if (error) throw error;

  return {
    cadenas: cadenas.data ?? [],
    estadisticas: {
      productosCatalogados: totalProductos.count ?? 0,
    },
  };
}

export async function GET(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  const parametros = new URL(request.url).searchParams;
  const pagina = enteroPositivo(parametros.get("pagina"), 1);
  const supermercado = parametros.get("supermercado")?.trim() ?? "";
  const busqueda = (parametros.get("q") ?? "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  try {
    const supabase = obtenerSupabaseServidor();
    const contexto = await cargarContextoCatalogo();
    let cadenaId: string | null = null;

    if (supermercado) {
      const cadena = contexto.cadenas.find((item) => item.slug === supermercado);
      if (!cadena) {
        return Response.json(
          { ok: false, error: "Supermercado no válido" },
          { status: 400 },
        );
      }
      cadenaId = cadena.id;
    }

    const desde = (pagina - 1) * PRODUCTOS_POR_PAGINA;
    const hasta = desde + PRODUCTOS_POR_PAGINA - 1;
    let consulta = supabase
      .from("productos")
      .select(
        "id, nombre, codigo_ean, url_imagen, activo, fecha_actualizacion, marcas(nombre), categorias(nombre), productos_supermercado!inner(id, activo, fecha_ultima_deteccion, cadena_supermercado_id, cadenas_supermercados(nombre, slug), precios!inner())",
        { count: "exact" },
      )
      .order("fecha_actualizacion", { ascending: false })
      .order("nombre", { ascending: true })
      .range(desde, hasta);

    consulta = consulta.eq("productos_supermercado.activo", true);
    if (busqueda) consulta = consulta.ilike("nombre", `%${busqueda}%`);
    if (cadenaId) {
      consulta = consulta.eq(
        "productos_supermercado.cadena_supermercado_id",
        cadenaId,
      );
    }

    const { data, error, count } = await consulta;
    if (error) throw error;
    const total = count ?? 0;

    return Response.json({
      ok: true,
      ...contexto,
      productos: data ?? [],
      paginacion: {
        pagina,
        porPagina: PRODUCTOS_POR_PAGINA,
        total,
        totalPaginas: Math.ceil(total / PRODUCTOS_POR_PAGINA),
      },
    });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido al cargar catálogo";
    console.error("No se pudo cargar el catálogo de administración:", mensaje);
    return Response.json(
      { ok: false, error: "No se pudo cargar el catálogo" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  let cuerpo: { termino?: unknown; supermercados?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "El cuerpo JSON no es válido" },
      { status: 400 },
    );
  }

  const termino = typeof cuerpo.termino === "string" ? cuerpo.termino.trim() : "";
  const terminoNormalizado = normalizarTerminoRastreo(termino);
  const supermercados = supermercadosValidos(cuerpo.supermercados);
  if (
    termino.length < 2 ||
    termino.length > 60 ||
    terminoNormalizado.length < 2 ||
    supermercados === null
  ) {
    return Response.json(
      { ok: false, error: "Término o supermercados no válidos" },
      { status: 400 },
    );
  }

  try {
    const supabase = obtenerSupabaseServidor();
    const { data: existente, error: errorExistente } = await supabase
      .from("terminos_rastreo")
      .select("id")
      .eq("termino_normalizado", terminoNormalizado)
      .maybeSingle();
    if (errorExistente) throw errorExistente;

    if (existente) {
      const { data, error } = await supabase
        .from("terminos_rastreo")
        .update({
          termino,
          supermercados,
          activo: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id)
        .select("*")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, creado: false, termino: data });
    }

    const { data, error } = await supabase
      .from("terminos_rastreo")
      .insert({
        termino,
        termino_normalizado: terminoNormalizado,
        supermercados,
        prioridad: 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, creado: true, termino: data });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido al guardar término";
    console.error("No se pudo guardar el término de rastreo:", mensaje);
    return Response.json(
      { ok: false, error: "No se pudo guardar el término" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const respuestaAutorizacion = autorizarAdmin(request);
  if (respuestaAutorizacion) return respuestaAutorizacion;

  let cuerpo: { id?: unknown; activo?: unknown; supermercados?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "El cuerpo JSON no es válido" },
      { status: 400 },
    );
  }

  const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
  const supermercados =
    cuerpo.supermercados === undefined
      ? undefined
      : supermercadosValidos(cuerpo.supermercados);
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    (cuerpo.activo !== undefined && typeof cuerpo.activo !== "boolean") ||
    supermercados === null
  ) {
    return Response.json(
      { ok: false, error: "Actualización no válida" },
      { status: 400 },
    );
  }

  const cambios: {
    activo?: boolean;
    supermercados?: SupermercadoRastreo[];
    updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (typeof cuerpo.activo === "boolean") cambios.activo = cuerpo.activo;
  if (supermercados) cambios.supermercados = supermercados;

  const { data, error } = await obtenerSupabaseServidor()
    .from("terminos_rastreo")
    .update(cambios)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("No se pudo actualizar el término:", error.message);
    return Response.json(
      { ok: false, error: "No se pudo actualizar el término" },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, termino: data });
}
