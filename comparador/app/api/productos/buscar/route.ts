import { registrarSolicitudRastreo } from "@/servicios/solicitudes-rastreo/servidor";
import {
  obtenerCadenasComprobadasRecientemente,
  reconciliarSolicitudConCatalogo,
} from "@/servicios/solicitudes-rastreo/cobertura";
import { puntuacionRelevanciaProducto } from "@/servicios/busqueda/relevancia-producto";
import { resolverTerminoRastreo } from "@/servicios/rastreo/resolucion-terminos";
import { obtenerSupabaseServidor } from "@/servicios/supabase/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductoSupermercadoDb = {
  id: string;
  producto_id: string | null;
  nombre_original: string;
  categoria_original: string | null;
  codigo_ean: string | null;
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
  precio_referencia: number | null;
  unidad_referencia: string | null;
  texto_promocion: string | null;
  fecha_inicio_promocion: string | null;
  fecha_fin_promocion: string | null;
  disponible: boolean;
  fecha_obtencion: string;
  tiendas: {
    id: string;
    nombre: string;
    municipio: string | null;
  } | null;
};

type CoberturaBusqueda = {
  encontrados: string[];
  pendientes: string[];
  sinResultadosRecientes: string[];
};

type IdProductoSupermercadoRpc = {
  producto_supermercado_id: string;
};

type CadenaSeleccionada = {
  id: string;
  nombre: string;
};

function imagenCarrefourConVersion(url: string | null, ean: string | null) {
  return ean
    ? `/api/imagenes/carrefour?ean=${encodeURIComponent(ean)}&v=3`
    : url;
}

async function respuestaSinProductos({
  request,
  consulta,
  soloOfertas,
  supermercados,
  terminoNormalizado,
}: {
  request: Request;
  consulta: string;
  soloOfertas: boolean;
  supermercados: string[];
  terminoNormalizado?: string;
}) {
  const cadenasComprobadas =
    consulta && !soloOfertas && terminoNormalizado
      ? await obtenerCadenasComprobadasRecientemente({ terminoNormalizado })
      : { conResultados: [], sinResultados: [] };
  const comprobadas = [
    ...cadenasComprobadas.conResultados,
    ...cadenasComprobadas.sinResultados,
  ];
  const pendientes = soloOfertas
    ? []
    : supermercados.filter(
        (supermercado) => !comprobadas.includes(supermercado),
      );
  const solicitudRastreo =
    consulta && !soloOfertas && pendientes.length > 0
      ? await registrarSolicitudRastreo({
          request,
          termino: consulta,
          supermercados: pendientes,
        })
      : null;

  return Response.json({
    ok: true,
    consulta,
    soloOfertas,
    supermercados,
    total: 0,
    productos: [],
    solicitudRastreo,
    cobertura: {
      encontrados: [],
      pendientes,
      sinResultadosRecientes: supermercados.filter((supermercado) =>
        cadenasComprobadas.sinResultados.includes(supermercado),
      ),
    } satisfies CoberturaBusqueda,
  });
}

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const consultaOriginal = parametros.get("q")?.trim() ?? "";
  const soloOfertas = ["1", "true"].includes(parametros.get("ofertas")?.toLowerCase() ?? "");
  const asegurarCobertura = ["1", "true"].includes(
    parametros.get("cobertura")?.toLowerCase() ?? "",
  );
  const limiteSolicitado = Number(parametros.get("limite") ?? 20);
  const limite = Number.isInteger(limiteSolicitado)
    ? Math.min(Math.max(limiteSolicitado, 1), 100)
    : 20;
  const supermercados = [
    ...new Set(
      parametros
        .getAll("supermercado")
        .map((nombre) => nombre.trim())
        .filter((nombre) => nombre.length > 0 && nombre.length <= 60),
    ),
  ].slice(0, 20);
  const consulta = consultaOriginal
    .replace(/[^\p{L}\p{N}\s.,-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if ((!soloOfertas && consulta.length < 2) || consulta.length > 80) {
    return Response.json(
      {
        ok: false,
        error: soloOfertas
          ? "La búsqueda no puede superar los 80 caracteres"
          : "La búsqueda debe tener entre 2 y 80 caracteres",
      },
      { status: 400 },
    );
  }

  try {
    const supabase = obtenerSupabaseServidor();
    const terminoResuelto = consulta
      ? await resolverTerminoRastreo(consulta)
      : null;
    const seleccionProductos =
      "id, producto_id, nombre_original, categoria_original, codigo_ean, url_imagen, url_producto, productos(nombre, marcas(nombre), categorias(nombre)), cadenas_supermercados(nombre)";

    let idsConPromocion: string[] | null = null;
    if (soloOfertas && !consulta) {
      const { data: preciosPromocionales, error: errorPromociones } = await supabase
        .from("precios")
        .select("producto_supermercado_id")
        .or("precio_promocional.not.is.null,texto_promocion.not.is.null")
        .order("fecha_obtencion", { ascending: false })
        .limit(1000);

      if (errorPromociones) throw errorPromociones;
      idsConPromocion = [
        ...new Set(
          (preciosPromocionales ?? []).map((precio) => precio.producto_supermercado_id),
        ),
      ];

      if (idsConPromocion.length === 0) {
        return respuestaSinProductos({
          request,
          consulta,
          soloOfertas,
          supermercados,
          terminoNormalizado: terminoResuelto?.normalizado,
        });
      }
    }

    let idsCadenas: string[] | null = null;
    let cadenasSeleccionadas: CadenaSeleccionada[] = [];
    if (supermercados.length > 0) {
      const { data: cadenas, error: errorCadenas } = await supabase
        .from("cadenas_supermercados")
        .select("id, nombre")
        .in("nombre", supermercados)
        .eq("activa", true);
      if (errorCadenas) throw errorCadenas;

      cadenasSeleccionadas = (cadenas ?? []) as CadenaSeleccionada[];
      idsCadenas = cadenasSeleccionadas.map((cadena) => cadena.id);
      if (idsCadenas.length === 0) {
        return respuestaSinProductos({
          request,
          consulta,
          soloOfertas,
          supermercados,
          terminoNormalizado: terminoResuelto?.normalizado,
        });
      }
    }

    function crearConsultaProductos(idsFiltro = idsCadenas) {
      let consultaProductos = supabase
        .from("productos_supermercado")
        .select(seleccionProductos)
        .eq("activo", true);
      if (idsFiltro) {
        consultaProductos = consultaProductos.in(
          "cadena_supermercado_id",
          idsFiltro,
        );
      }
      return consultaProductos;
    }

    let data: unknown[] = [];
    if (consulta) {
      for (const variante of terminoResuelto?.variantesBusqueda ?? [consulta]) {
        const { data: coincidencias, error: errorCoincidencias } =
          await supabase.rpc("buscar_ids_productos_supermercado", {
            p_consulta: variante,
            p_cadenas: idsCadenas,
            p_limite: Math.min(
              500,
              Math.max(120, limite * Math.max(idsCadenas?.length ?? 1, 1)),
            ),
          });
        if (errorCoincidencias) throw errorCoincidencias;
        const idsCoincidentes = (
          (coincidencias ?? []) as IdProductoSupermercadoRpc[]
        ).map((item) => item.producto_supermercado_id);
        if (idsCoincidentes.length === 0) continue;
        const resultado = await crearConsultaProductos().in(
          "id",
          idsCoincidentes,
        );
        if (resultado.error) throw resultado.error;
        data = resultado.data ?? [];
        if (data.length > 0) break;
      }

      if (
        asegurarCobertura &&
        cadenasSeleccionadas.length > 1 &&
        data.length > 0
      ) {
        const cadenasConCoincidencias = new Set(
          (data as unknown as ProductoSupermercadoDb[])
            .map((producto) => producto.cadenas_supermercados?.nombre)
            .filter((nombre): nombre is string => Boolean(nombre)),
        );
        const cadenasFaltantes = cadenasSeleccionadas.filter(
          (cadena) => !cadenasConCoincidencias.has(cadena.nombre),
        );
        const variantes = terminoResuelto?.variantesBusqueda ?? [consulta];
        const resultadosAdicionales = await Promise.all(
          cadenasFaltantes.map(async (cadena) => {
            for (const variante of variantes) {
              const { data: coincidencias, error: errorCoincidencias } =
                await supabase.rpc("buscar_ids_productos_supermercado", {
                  p_consulta: variante,
                  p_cadenas: [cadena.id],
                  p_limite: Math.min(100, Math.max(limite, 20)),
                });
              if (errorCoincidencias) throw errorCoincidencias;
              const idsCoincidentes = (
                (coincidencias ?? []) as IdProductoSupermercadoRpc[]
              ).map((item) => item.producto_supermercado_id);
              if (idsCoincidentes.length === 0) continue;

              const resultado = await crearConsultaProductos([cadena.id]).in(
                "id",
                idsCoincidentes,
              );
              if (resultado.error) throw resultado.error;
              if ((resultado.data?.length ?? 0) > 0) {
                return resultado.data ?? [];
              }
            }
            return [];
          }),
        );
        const productosUnicos = new Map<string, unknown>();
        for (const producto of [
          ...data,
          ...resultadosAdicionales.flat(),
        ] as Array<{ id: string }>) {
          productosUnicos.set(producto.id, producto);
        }
        data = [...productosUnicos.values()];
      }
    } else {
      const resultado = await crearConsultaProductos()
        .in("id", idsConPromocion ?? [])
        .limit(200);
      if (resultado.error) throw resultado.error;
      data = resultado.data ?? [];
    }

    const productosSupermercado =
      (data ?? []) as unknown as ProductoSupermercadoDb[];
    if (productosSupermercado.length === 0) {
      return respuestaSinProductos({
        request,
        consulta,
        soloOfertas,
        supermercados,
        terminoNormalizado: terminoResuelto?.normalizado,
      });
    }

    const ids = productosSupermercado.map((producto) => producto.id);
    const { data: datosPrecios, error: errorPrecios } = await supabase
      .from("precios")
      .select(
        "producto_supermercado_id, precio, precio_promocional, precio_referencia, unidad_referencia, texto_promocion, fecha_inicio_promocion, fecha_fin_promocion, disponible, fecha_obtencion, tiendas(id, nombre, municipio)",
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
          precioReferencia: number | null;
          unidadReferencia: string | null;
          textoPromocion: string | null;
          enOferta: boolean;
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
        imagen:
          producto.cadenas_supermercados?.nombre === "Carrefour"
            ? imagenCarrefourConVersion(
                producto.url_imagen,
                producto.codigo_ean,
              )
            : producto.url_imagen,
        marca: producto.productos?.marcas?.nombre ?? null,
        categoria:
          producto.productos?.categorias?.nombre ??
          producto.categoria_original ??
          null,
        ofertas: [],
      };

      for (const precio of ultimoPrecioPorTienda.values()) {
        if (precio.producto_supermercado_id !== producto.id) continue;
        const ahora = Date.now();
        const promocionVigente =
          (precio.precio_promocional !== null || Boolean(precio.texto_promocion)) &&
          (!precio.fecha_inicio_promocion ||
            new Date(precio.fecha_inicio_promocion).getTime() <= ahora) &&
          (!precio.fecha_fin_promocion ||
            new Date(precio.fecha_fin_promocion).getTime() >= ahora);

        agrupado.ofertas.push({
          supermercado: producto.cadenas_supermercados?.nombre ?? "Supermercado",
          tienda: precio.tiendas?.nombre ?? "Tienda online",
          municipio: precio.tiendas?.municipio ?? null,
          precio: Number(
            promocionVigente && precio.precio_promocional !== null
              ? precio.precio_promocional
              : precio.precio,
          ),
          precioOriginal:
            promocionVigente && precio.precio_promocional !== null
              ? Number(precio.precio)
              : null,
          precioReferencia:
            precio.precio_referencia === null
              ? null
              : Number(precio.precio_referencia),
          unidadReferencia: precio.unidad_referencia,
          textoPromocion: promocionVigente ? precio.texto_promocion : null,
          enOferta: promocionVigente,
          disponible: precio.disponible,
          fechaObtencion: precio.fecha_obtencion,
          urlProducto: producto.url_producto,
        });
      }

      agrupado.ofertas.sort((a, b) => a.precio - b.precio);
      agrupados.set(claveProducto, agrupado);
    }

    const productosCoincidentes = [...agrupados.values()]
      .filter((producto) => producto.ofertas.length > 0)
      .filter(
        (producto) => !soloOfertas || producto.ofertas.some((oferta) => oferta.enOferta),
      )
      .filter(
        (producto) =>
          !consulta ||
          puntuacionRelevanciaProducto(
            producto.nombre,
            terminoResuelto?.termino ?? consulta,
          ) > 0,
      )
      .sort((a, b) => (a.ofertas[0]?.precio ?? Infinity) - (b.ofertas[0]?.precio ?? Infinity));
    const productos = productosCoincidentes.slice(0, limite);
    if (asegurarCobertura && supermercados.length > 0) {
      const idsIncluidos = new Set(productos.map((producto) => producto.id));

      for (const supermercado of supermercados) {
        const candidatosSupermercado = productosCoincidentes.filter(
          (producto) =>
            producto.ofertas.some(
              (oferta) =>
                oferta.supermercado === supermercado && oferta.disponible,
            ),
        );
        const candidatosCobertura = candidatosSupermercado;
        let mejorProducto: (typeof productosCoincidentes)[number] | null = null;
        let mejorPrecio = Infinity;
        let mejorRelevancia = -1;

        for (const producto of candidatosCobertura) {
          const precioSupermercado = Math.min(
            ...producto.ofertas
              .filter(
                (oferta) =>
                  oferta.supermercado === supermercado && oferta.disponible,
              )
              .map((oferta) => oferta.precio),
          );
          const relevancia = puntuacionRelevanciaProducto(
            producto.nombre,
            terminoResuelto?.termino ?? consulta,
          );
          if (
            relevancia > mejorRelevancia ||
            (relevancia === mejorRelevancia && precioSupermercado < mejorPrecio)
          ) {
            mejorRelevancia = relevancia;
            mejorPrecio = precioSupermercado;
            mejorProducto = producto;
          }
        }

        if (mejorProducto && !idsIncluidos.has(mejorProducto.id)) {
          productos.push(mejorProducto);
          idsIncluidos.add(mejorProducto.id);
        }
      }
    }

    if (productos.length === 0) {
      return respuestaSinProductos({
        request,
        consulta,
        soloOfertas,
        supermercados,
        terminoNormalizado: terminoResuelto?.normalizado,
      });
    }

    const supermercadosEncontrados = [
      ...new Set(
        productosCoincidentes.flatMap((producto) =>
          producto.ofertas.map((oferta) => oferta.supermercado),
        ),
      ),
    ];
    if (consulta && terminoResuelto) {
      await reconciliarSolicitudConCatalogo({
        terminoNormalizado: terminoResuelto.normalizado,
        supermercadosEncontrados,
      });
    }
    const cadenasComprobadas =
      consulta && !soloOfertas && terminoResuelto
        ? await obtenerCadenasComprobadasRecientemente({
            terminoNormalizado: terminoResuelto.normalizado,
          })
        : { conResultados: [], sinResultados: [] };
    const cadenasComprobadasRecientemente = [
      ...cadenasComprobadas.conResultados,
      ...cadenasComprobadas.sinResultados,
    ];
    const sinResultadosRecientes = supermercados.filter(
      (supermercado) =>
        !supermercadosEncontrados.includes(supermercado) &&
        cadenasComprobadas.sinResultados.includes(supermercado),
    );
    const supermercadosPendientes =
      consulta && !soloOfertas
        ? supermercados.filter(
            (supermercado) =>
              !supermercadosEncontrados.includes(supermercado) &&
              !cadenasComprobadasRecientemente.includes(supermercado),
          )
        : [];
    const solicitudRastreo =
      supermercadosPendientes.length > 0
        ? await registrarSolicitudRastreo({
            request,
            termino: consulta,
            supermercados: supermercadosPendientes,
          })
        : null;

    return Response.json({
      ok: true,
      consulta,
      soloOfertas,
      supermercados,
      total: productos.length,
      productos,
      solicitudRastreo,
      cobertura: {
        encontrados: supermercadosEncontrados,
        pendientes: supermercadosPendientes,
        sinResultadosRecientes,
      } satisfies CoberturaBusqueda,
    });
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
