import "server-only";

import type { TipoRastreo } from "@/servicios/rastreo/configuracion";
import {
  revertirAltasSinPrecio,
  tienePrecioUtil,
} from "@/servicios/rastreo/limpieza-persistencia";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

import { crearSlug } from "./categorias-eroski";
import type { ErrorRastreoEroski } from "./rastreo-lote";
import type { ProductoEroski } from "./tipos-eroski";

type ContextoEroski = {
  cadenaId: string;
  tiendaId: string;
};

type ProductoSupermercadoGuardado = {
  id: string;
  identificador_externo: string;
  producto_id: string | null;
};

type EntidadCatalogo = {
  id: string;
  slug: string;
};

export type ResumenPersistenciaEroski = {
  ejecucionId: string;
  productosDetectados: number;
  productosNuevos: number;
  preciosInsertados: number;
  marcasCreadas: number;
  categoriasCreadas: number;
  productosNormalizados: number;
};

async function obtenerContextoEroski(): Promise<ContextoEroski> {
  const supabase = obtenerSupabaseServidor();
  const { data: cadena, error: errorCadena } = await supabase
    .from("cadenas_supermercados")
    .select("id")
    .eq("slug", "eroski")
    .eq("activa", true)
    .single();

  if (errorCadena || !cadena) {
    throw new Error("No se encontró una cadena Eroski activa en Supabase");
  }

  const { data: configuracion, error: errorConfiguracion } = await supabase
    .from("configuracion_rastreo")
    .select("tienda_id")
    .eq("cadena_supermercado_id", cadena.id)
    .eq("activo", true)
    .not("tienda_id", "is", null)
    .limit(1)
    .single();

  if (errorConfiguracion || !configuracion?.tienda_id) {
    throw new Error("Eroski no tiene una tienda configurada para el rastreo");
  }

  return { cadenaId: cadena.id, tiendaId: configuracion.tienda_id };
}

async function sincronizarCatalogo(
  tabla: "marcas" | "categorias",
  nombres: Array<string | null | undefined>,
): Promise<{ porSlug: Map<string, string>; creadas: number }> {
  const supabase = obtenerSupabaseServidor();
  const unicas = new Map<string, string>();

  for (const nombre of nombres) {
    if (!nombre?.trim()) continue;
    const nombreLimpio = nombre.trim();
    const slug = crearSlug(nombreLimpio);
    if (slug) unicas.set(slug, nombreLimpio);
  }

  const slugs = [...unicas.keys()];
  if (slugs.length === 0) return { porSlug: new Map(), creadas: 0 };

  const { data: existentes, error: errorExistentes } = await supabase
    .from(tabla)
    .select("id, slug")
    .in("slug", slugs);
  if (errorExistentes) throw errorExistentes;

  const slugsExistentes = new Set((existentes ?? []).map((item) => item.slug));
  const { data, error } = await supabase
    .from(tabla)
    .upsert(
      [...unicas].map(([slug, nombre]) => ({ slug, nombre, activa: true })),
      { onConflict: "slug" },
    )
    .select("id, slug");
  if (error) throw error;

  const entidades = (data ?? []) as EntidadCatalogo[];
  return {
    porSlug: new Map(entidades.map((entidad) => [entidad.slug, entidad.id])),
    creadas: slugs.filter((slug) => !slugsExistentes.has(slug)).length,
  };
}

function datosProductoSupermercado(
  producto: ProductoEroski,
  cadenaId: string,
  ahora: string,
  productoId?: string,
) {
  return {
    cadena_supermercado_id: cadenaId,
    identificador_externo: producto.identificadorExterno,
    producto_id: productoId,
    nombre_original: producto.nombreOriginal,
    marca_original: producto.marcaOriginal,
    categoria_original: producto.categoriaSugerida ?? null,
    url_producto: producto.urlProducto,
    url_imagen: producto.urlImagen,
    activo: producto.disponible,
    fecha_ultima_deteccion: ahora,
  };
}

async function registrarErrores(
  ejecucionId: string,
  cadenaId: string,
  errores: ErrorRastreoEroski[],
) {
  if (errores.length === 0) return;

  const supabase = obtenerSupabaseServidor();
  const { error } = await supabase.from("errores_rastreo").insert(
    errores.map((item) => ({
      ejecucion_rastreo_id: ejecucionId,
      cadena_supermercado_id: cadenaId,
      tipo_error: "extraccion",
      mensaje: item.mensaje,
      datos: { consulta: item.consulta, pagina: item.pagina },
    })),
  );

  if (error) console.error("No se pudieron registrar errores de rastreo:", error.message);
}

export async function guardarRastreoEroski({
  productos: productosDetectados,
  consultas,
  errores,
  tipoRastreo = "manual",
}: {
  productos: ProductoEroski[];
  consultas: string[];
  errores: ErrorRastreoEroski[];
  tipoRastreo?: TipoRastreo;
}): Promise<ResumenPersistenciaEroski> {
  const productos = productosDetectados.filter((producto) =>
    tienePrecioUtil(producto.precio),
  );
  const supabase = obtenerSupabaseServidor();
  const contexto = await obtenerContextoEroski();
  const ahora = new Date().toISOString();
  const { data: ejecucion, error: errorEjecucion } = await supabase
    .from("ejecuciones_rastreo")
    .insert({
      cadena_supermercado_id: contexto.cadenaId,
      tienda_id: contexto.tiendaId,
      tipo_rastreo: tipoRastreo,
      estado: "en_proceso",
      fecha_inicio: ahora,
      detalles: { consultas, normalizacion: true },
    })
    .select("id")
    .single();

  if (errorEjecucion || !ejecucion) {
    throw new Error(`No se pudo crear la ejecución: ${errorEjecucion?.message ?? "sin datos"}`);
  }

  try {
    const identificadores = productos.map((producto) => producto.identificadorExterno);
    const { data: existentes, error: errorExistentes } = await supabase
      .from("productos_supermercado")
      .select("identificador_externo, producto_id")
      .eq("cadena_supermercado_id", contexto.cadenaId)
      .in("identificador_externo", identificadores);
    if (errorExistentes) throw errorExistentes;

    const productoIdPorIdentificadorExistente = new Map(
      (existentes ?? []).map((producto) => [
        producto.identificador_externo,
        producto.producto_id,
      ]),
    );
    const identificadoresExistentes = new Set(
      (existentes ?? []).map((producto) => producto.identificador_externo),
    );
    const productosNuevos = productos.filter(
      (producto) => !identificadoresExistentes.has(producto.identificadorExterno),
    ).length;

    const [marcas, categorias] = await Promise.all([
      sincronizarCatalogo(
        "marcas",
        productos.map((producto) => producto.marcaOriginal),
      ),
      sincronizarCatalogo(
        "categorias",
        productos.map((producto) => producto.categoriaSugerida),
      ),
    ]);

    const { data: guardados, error: errorProductos } = await supabase
      .from("productos_supermercado")
      .upsert(
        productos.map((producto) =>
          datosProductoSupermercado(
            producto,
            contexto.cadenaId,
            ahora,
            productoIdPorIdentificadorExistente.get(
              producto.identificadorExterno,
            ) ?? undefined,
          ),
        ),
        { onConflict: "cadena_supermercado_id,identificador_externo" },
      )
      .select("id, identificador_externo, producto_id");
    if (errorProductos) throw errorProductos;

    const productosPorIdentificador = new Map(
      productos.map((producto) => [producto.identificadorExterno, producto]),
    );
    const pendientes = ((guardados ?? []) as ProductoSupermercadoGuardado[]).filter(
      (producto) => !producto.producto_id,
    );
    const normalizadosNuevos = pendientes.map((guardado) => {
      const origen = productosPorIdentificador.get(guardado.identificador_externo);
      if (!origen) throw new Error("No se encontró el producto de origen para normalizar");

      const marcaId = origen.marcaOriginal
        ? marcas.porSlug.get(crearSlug(origen.marcaOriginal))
        : undefined;
      const categoriaId = origen.categoriaSugerida
        ? categorias.porSlug.get(crearSlug(origen.categoriaSugerida))
        : undefined;

      return {
        nombre: origen.nombreOriginal,
        marca_id: marcaId,
        categoria_id: categoriaId,
        cantidad_unidades: 1,
        url_imagen: origen.urlImagen,
        texto_busqueda: origen.nombreOriginal,
        activo: origen.disponible,
      };
    });

    let idsNormalizados: string[] = [];
    const referenciasNuevasIds = (
      (guardados ?? []) as ProductoSupermercadoGuardado[]
    )
      .filter(
        (producto) =>
          !identificadoresExistentes.has(producto.identificador_externo),
      )
      .map((producto) => producto.id);
    if (normalizadosNuevos.length > 0) {
      const { data, error } = await supabase
        .from("productos")
        .insert(normalizadosNuevos)
        .select("id");
      if (error) throw error;
      idsNormalizados = (data ?? []).map((producto) => producto.id);

      if (idsNormalizados.length !== pendientes.length) {
        await revertirAltasSinPrecio({
          supabase,
          productosIds: idsNormalizados,
          referenciasIds: referenciasNuevasIds,
        });
        throw new Error("No se crearon todos los productos normalizados esperados");
      }

      const { error: errorVinculos } = await supabase
        .from("productos_supermercado")
        .upsert(
          pendientes.map((guardado, indice) => {
            const origen = productosPorIdentificador.get(guardado.identificador_externo);
            if (!origen) throw new Error("No se encontró el producto para vincular");
            return datosProductoSupermercado(
              origen,
              contexto.cadenaId,
              ahora,
              idsNormalizados[indice],
            );
          }),
          { onConflict: "cadena_supermercado_id,identificador_externo" },
        );
      if (errorVinculos) {
        await revertirAltasSinPrecio({
          supabase,
          productosIds: idsNormalizados,
          referenciasIds: referenciasNuevasIds,
        });
        throw errorVinculos;
      }
    }

    const productoIdPorIdentificador = new Map(
      ((guardados ?? []) as ProductoSupermercadoGuardado[]).map((producto) => [
        producto.identificador_externo,
        producto.id,
      ]),
    );
    const precios = productos.flatMap((producto) => {
      const productoSupermercadoId = productoIdPorIdentificador.get(
        producto.identificadorExterno,
      );
      return productoSupermercadoId
        ? [
            {
              producto_supermercado_id: productoSupermercadoId,
              tienda_id: contexto.tiendaId,
              precio: producto.precio,
              disponible: producto.disponible,
              fecha_obtencion: ahora,
            },
          ]
        : [];
    });

    const { error: errorPrecios } = await supabase.from("precios").insert(precios);
    if (errorPrecios) {
      await revertirAltasSinPrecio({
        supabase,
        productosIds: idsNormalizados,
        referenciasIds: referenciasNuevasIds,
      });
      throw errorPrecios;
    }

    await registrarErrores(ejecucion.id, contexto.cadenaId, errores);

    const { error: errorFinalizacion } = await supabase
      .from("ejecuciones_rastreo")
      .update({
        estado: errores.length > 0 ? "completado_con_errores" : "completado",
        fecha_fin: new Date().toISOString(),
        productos_detectados: productos.length,
        productos_nuevos: productosNuevos,
        precios_insertados: precios.length,
        errores_detectados: errores.length,
      })
      .eq("id", ejecucion.id);
    if (errorFinalizacion) throw errorFinalizacion;

    return {
      ejecucionId: ejecucion.id,
      productosDetectados: productos.length,
      productosNuevos,
      preciosInsertados: precios.length,
      marcasCreadas: marcas.creadas,
      categoriasCreadas: categorias.creadas,
      productosNormalizados: idsNormalizados.length,
    };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";

    await supabase
      .from("ejecuciones_rastreo")
      .update({
        estado: "error",
        fecha_fin: new Date().toISOString(),
        errores_detectados: 1,
        mensaje_error: mensaje,
      })
      .eq("id", ejecucion.id);

    throw new Error(`No se pudo guardar el rastreo: ${mensaje}`);
  }
}
