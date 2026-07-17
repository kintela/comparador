import "server-only";

import { crearSlug } from "@/servicios/eroski/categorias-eroski";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

import type { ErrorRastreoBm, ProductoBm } from "./tipos-bm";

type ContextoBm = { cadenaId: string; tiendaId: string };
type EntidadCatalogo = { id: string; slug: string };
type ProductoNormalizadoDb = {
  id: string;
  nombre: string;
  codigo_ean: string | null;
  marca_id: string | null;
  categoria_id: string | null;
  marcas: { nombre: string } | null;
};
type ProductoSupermercadoDb = {
  id: string;
  identificador_externo: string;
  producto_id: string | null;
};

export type ResumenPersistenciaBm = {
  ejecucionId: string;
  productosDetectados: number;
  productosNuevos: number;
  preciosInsertados: number;
  marcasCreadas: number;
  categoriasCreadas: number;
  productosCoincidentes: number;
  productosNormalizados: number;
};

async function obtenerContextoBm(): Promise<ContextoBm> {
  const supabase = obtenerSupabaseServidor();
  const { data: cadena, error: errorCadena } = await supabase
    .from("cadenas_supermercados")
    .select("id")
    .eq("slug", "bm-supermercados")
    .eq("activa", true)
    .single();
  if (errorCadena || !cadena) {
    throw new Error("No se encontró la cadena BM Supermercados activa");
  }

  const { data: tiendaExistente, error: errorTienda } = await supabase
    .from("tiendas")
    .select("id")
    .eq("cadena_supermercado_id", cadena.id)
    .eq("identificador_externo", "bm-online-general")
    .maybeSingle();
  if (errorTienda) throw errorTienda;
  if (tiendaExistente) return { cadenaId: cadena.id, tiendaId: tiendaExistente.id };

  const { data: tienda, error: errorCrearTienda } = await supabase
    .from("tiendas")
    .insert({
      cadena_supermercado_id: cadena.id,
      identificador_externo: "bm-online-general",
      nombre: "BM Online",
      es_tienda_online: true,
      zona_online: "Catálogo online general",
      activa: true,
      url_tienda: "https://www.online.bmsupermercados.es/es",
      url_catalogo: "https://www.online.bmsupermercados.es/es",
    })
    .select("id")
    .single();
  if (errorCrearTienda || !tienda) {
    throw new Error(`No se pudo crear BM Online: ${errorCrearTienda?.message ?? "sin datos"}`);
  }

  return { cadenaId: cadena.id, tiendaId: tienda.id };
}

async function sincronizarCatalogo(
  tabla: "marcas" | "categorias",
  nombres: Array<string | null>,
): Promise<{ porSlug: Map<string, string>; creadas: number }> {
  const supabase = obtenerSupabaseServidor();
  const unicas = new Map<string, string>();
  for (const nombre of nombres) {
    const limpio = nombre?.trim();
    if (!limpio) continue;
    const slug = crearSlug(limpio);
    if (slug) unicas.set(slug, limpio);
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

function tokensNombre(nombre: string, marca: string | null): Set<string> {
  const marcaNormalizada = marca ? crearSlug(marca).replaceAll("-", " ") : "";
  const texto = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(litros?|lts?)\b/g, "l")
    .replace(/\b(gramos?|grs?)\b/g, "g")
    .replace(/\b(kilogramos?|kilos?)\b/g, "kg")
    .replace(/\b(mililitros?)\b/g, "ml")
    .replace(/[^a-z0-9]+/g, " ");
  const ignorar = new Set([
    "de",
    "del",
    "la",
    "el",
    "en",
    "brik",
    "brick",
    "botella",
    "envase",
    "pack",
    ...marcaNormalizada.split(" "),
  ]);
  return new Set(texto.split(" ").filter((token) => token && !ignorar.has(token)));
}

function similitudNombre(
  nombreA: string,
  nombreB: string,
  marca: string | null,
): number {
  const a = tokensNombre(nombreA, marca);
  const b = tokensNombre(nombreB, marca);
  if (a.size === 0 || b.size === 0) return 0;
  const comunes = [...a].filter((token) => b.has(token)).length;
  return (2 * comunes) / (a.size + b.size);
}

function extraerCantidadBase(nombre: string): { tipo: "volumen" | "peso"; valor: number } | null {
  const texto = nombre.toLowerCase().replace(",", ".");
  const pack = texto.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(ml|cl|l|kg|g)\b/);
  const cantidad = texto.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l|kg|g)\b/);
  const coincidencia = pack ?? cantidad;
  if (!coincidencia) return null;

  const multiplicadorPack = pack ? Number(pack[1]) : 1;
  const valor = Number(pack ? pack[2] : coincidencia[1]);
  const unidad = pack ? pack[3] : coincidencia[2];
  if (!Number.isFinite(valor)) return null;

  if (unidad === "l") return { tipo: "volumen", valor: multiplicadorPack * valor * 1000 };
  if (unidad === "cl") return { tipo: "volumen", valor: multiplicadorPack * valor * 10 };
  if (unidad === "ml") return { tipo: "volumen", valor: multiplicadorPack * valor };
  if (unidad === "kg") return { tipo: "peso", valor: multiplicadorPack * valor * 1000 };
  return { tipo: "peso", valor: multiplicadorPack * valor };
}

function cantidadesCompatibles(nombreA: string, nombreB: string): boolean {
  const a = extraerCantidadBase(nombreA);
  const b = extraerCantidadBase(nombreB);
  if (!a || !b) return true;
  return a.tipo === b.tipo && Math.abs(a.valor - b.valor) <= Math.max(a.valor, b.valor) * 0.01;
}

function resolverProductoNormalizado(
  producto: ProductoBm,
  normalizados: ProductoNormalizadoDb[],
): { id: string; puntuacion: number; porEan: boolean } | null {
  if (producto.ean) {
    const porEan = normalizados.find((item) => item.codigo_ean === producto.ean);
    if (porEan) return { id: porEan.id, puntuacion: 1, porEan: true };
  }

  if (!producto.marcaOriginal) return null;
  const slugMarca = crearSlug(producto.marcaOriginal);
  const candidatos = normalizados
    .filter(
      (item) =>
        item.marcas?.nombre &&
        crearSlug(item.marcas.nombre) === slugMarca &&
        cantidadesCompatibles(producto.nombreOriginal, item.nombre),
    )
    .map((item) => ({
      id: item.id,
      puntuacion: similitudNombre(
        producto.nombreOriginal,
        item.nombre,
        producto.marcaOriginal,
      ),
    }))
    .sort((a, b) => b.puntuacion - a.puntuacion);

  const mejor = candidatos[0];
  const segundo = candidatos[1];
  if (!mejor || mejor.puntuacion < 0.88) return null;
  if (segundo && mejor.puntuacion - segundo.puntuacion < 0.12) return null;
  return { ...mejor, porEan: false };
}

function datosProductoSupermercado(
  producto: ProductoBm,
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
    categoria_original: producto.categoriaOriginal ?? producto.categoriaSugerida,
    codigo_ean: producto.ean,
    url_producto: producto.urlProducto,
    url_imagen: producto.urlImagen,
    activo: producto.disponible,
    fecha_ultima_deteccion: ahora,
  };
}

async function registrarErrores(
  ejecucionId: string,
  cadenaId: string,
  errores: ErrorRastreoBm[],
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
  if (error) console.error("No se pudieron registrar errores BM:", error.message);
}

export async function guardarRastreoBm({
  productos,
  consultas,
  errores,
}: {
  productos: ProductoBm[];
  consultas: string[];
  errores: ErrorRastreoBm[];
}): Promise<ResumenPersistenciaBm> {
  const supabase = obtenerSupabaseServidor();
  const contexto = await obtenerContextoBm();
  const ahora = new Date().toISOString();
  const { data: ejecucion, error: errorEjecucion } = await supabase
    .from("ejecuciones_rastreo")
    .insert({
      cadena_supermercado_id: contexto.cadenaId,
      tienda_id: contexto.tiendaId,
      tipo_rastreo: "manual",
      estado: "en_proceso",
      fecha_inicio: ahora,
      detalles: { consultas, origen: "bm-online-general", normalizacion: true },
    })
    .select("id")
    .single();
  if (errorEjecucion || !ejecucion) {
    throw new Error(`No se pudo crear la ejecución BM: ${errorEjecucion?.message ?? "sin datos"}`);
  }

  try {
    const identificadores = productos.map((producto) => producto.identificadorExterno);
    const [{ data: existentesBm, error: errorExistentes }, { data: datosNormalizados, error: errorNormalizados }] =
      await Promise.all([
        supabase
          .from("productos_supermercado")
          .select("id, identificador_externo, producto_id")
          .eq("cadena_supermercado_id", contexto.cadenaId)
          .in("identificador_externo", identificadores),
        supabase
          .from("productos")
          .select("id, nombre, codigo_ean, marca_id, categoria_id, marcas(nombre)")
          .limit(1000),
      ]);
    if (errorExistentes) throw errorExistentes;
    if (errorNormalizados) throw errorNormalizados;

    const existentes = (existentesBm ?? []) as ProductoSupermercadoDb[];
    const normalizados = (datosNormalizados ?? []) as unknown as ProductoNormalizadoDb[];
    const existentePorCodigo = new Map(
      existentes.map((producto) => [producto.identificador_externo, producto]),
    );
    const productosNuevos = productos.filter(
      (producto) => !existentePorCodigo.has(producto.identificadorExterno),
    ).length;

    const [marcas, categorias] = await Promise.all([
      sincronizarCatalogo(
        "marcas",
        productos.map((producto) => producto.marcaOriginal),
      ),
      sincronizarCatalogo(
        "categorias",
        productos.map(
          (producto) => producto.categoriaSugerida ?? producto.categoriaOriginal,
        ),
      ),
    ]);

    const vinculoPorCodigo = new Map<string, string>();
    let productosCoincidentes = 0;
    for (const producto of productos) {
      const existente = existentePorCodigo.get(producto.identificadorExterno);
      if (existente?.producto_id) {
        vinculoPorCodigo.set(producto.identificadorExterno, existente.producto_id);
        continue;
      }
      const coincidencia = resolverProductoNormalizado(producto, normalizados);
      if (coincidencia) {
        vinculoPorCodigo.set(producto.identificadorExterno, coincidencia.id);
        productosCoincidentes += 1;
      }
    }

    const { data: guardados, error: errorProductos } = await supabase
      .from("productos_supermercado")
      .upsert(
        productos.map((producto) =>
          datosProductoSupermercado(
            producto,
            contexto.cadenaId,
            ahora,
            vinculoPorCodigo.get(producto.identificadorExterno),
          ),
        ),
        { onConflict: "cadena_supermercado_id,identificador_externo" },
      )
      .select("id, identificador_externo, producto_id");
    if (errorProductos) throw errorProductos;

    const productosPorCodigo = new Map(
      productos.map((producto) => [producto.identificadorExterno, producto]),
    );
    const pendientes = ((guardados ?? []) as ProductoSupermercadoDb[]).filter(
      (producto) => !producto.producto_id,
    );
    const filasNormalizadas = pendientes.map((guardado) => {
      const origen = productosPorCodigo.get(guardado.identificador_externo);
      if (!origen) throw new Error("No se encontró el producto BM para normalizar");
      const marcaId = origen.marcaOriginal
        ? marcas.porSlug.get(crearSlug(origen.marcaOriginal))
        : undefined;
      const categoria = origen.categoriaSugerida ?? origen.categoriaOriginal;
      const categoriaId = categoria
        ? categorias.porSlug.get(crearSlug(categoria))
        : undefined;
      return {
        nombre: origen.nombreOriginal,
        codigo_ean: origen.ean,
        marca_id: marcaId,
        categoria_id: categoriaId,
        cantidad_unidades: 1,
        url_imagen: origen.urlImagen,
        texto_busqueda: origen.nombreOriginal,
        activo: origen.disponible,
      };
    });

    let idsNormalizados: string[] = [];
    if (filasNormalizadas.length > 0) {
      const { data, error } = await supabase
        .from("productos")
        .insert(filasNormalizadas)
        .select("id");
      if (error) throw error;
      idsNormalizados = (data ?? []).map((producto) => producto.id);
      if (idsNormalizados.length !== pendientes.length) {
        throw new Error("No se crearon todos los productos BM normalizados");
      }

      const { error: errorVinculos } = await supabase
        .from("productos_supermercado")
        .upsert(
          pendientes.map((guardado, indice) => {
            const origen = productosPorCodigo.get(guardado.identificador_externo);
            if (!origen) throw new Error("No se encontró el producto BM para vincular");
            return datosProductoSupermercado(
              origen,
              contexto.cadenaId,
              ahora,
              idsNormalizados[indice],
            );
          }),
          { onConflict: "cadena_supermercado_id,identificador_externo" },
        );
      if (errorVinculos) throw errorVinculos;
    }

    const actualizacionesEan = productos.flatMap((producto) => {
      const productoId = vinculoPorCodigo.get(producto.identificadorExterno);
      const normalizado = normalizados.find((item) => item.id === productoId);
      return productoId && producto.ean && normalizado && !normalizado.codigo_ean
        ? [{ id: productoId, ean: producto.ean }]
        : [];
    });
    await Promise.all(
      actualizacionesEan.map(async ({ id, ean }) => {
        const { error } = await supabase
          .from("productos")
          .update({ codigo_ean: ean })
          .eq("id", id);
        if (error) throw error;
      }),
    );

    const idSupermercadoPorCodigo = new Map(
      ((guardados ?? []) as ProductoSupermercadoDb[]).map((producto) => [
        producto.identificador_externo,
        producto.id,
      ]),
    );
    const precios = productos.flatMap((producto) => {
      const productoSupermercadoId = idSupermercadoPorCodigo.get(
        producto.identificadorExterno,
      );
      return productoSupermercadoId
        ? [{
            producto_supermercado_id: productoSupermercadoId,
            tienda_id: contexto.tiendaId,
            precio: producto.precio,
            precio_promocional: producto.precioPromocional,
            texto_promocion: producto.textoPromocion,
            precio_referencia: producto.precioReferencia,
            unidad_referencia: producto.unidadReferencia,
            disponible: producto.disponible,
            fecha_inicio_promocion: producto.fechaInicioPromocion,
            fecha_fin_promocion: producto.fechaFinPromocion,
            fecha_obtencion: ahora,
          }]
        : [];
    });
    const { error: errorPrecios } = await supabase.from("precios").insert(precios);
    if (errorPrecios) throw errorPrecios;

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
        detalles: {
          consultas,
          origen: "bm-online-general",
          productos_coincidentes: productosCoincidentes,
        },
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
      productosCoincidentes,
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
    throw new Error(`No se pudo guardar el rastreo BM: ${mensaje}`);
  }
}
