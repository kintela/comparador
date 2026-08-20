import "server-only";

import type { ListaCompraCorreo } from "@/servicios/email/lista-compra";

const HOSTS_IMAGEN_PERMITIDOS = new Set([
  "comparador.kintela.es",
  "supermercado.eroski.es",
  "cdn-bm.aktiosdigitalservices.com",
  "prod-mercadona.imgix.net",
  "s7g10.scene7.com",
  "www.dia.es",
  "www.lidl.es",
  "www.compraonline.alcampo.es",
  "www.lupaonline.com",
  "static.carrefour.es",
  "d2lnr5mha7bycj.cloudfront.net",
  "media.primaprix.eu",
  "sgfm.elcorteingles.es",
  "cdn.grupoelcorteingles.es",
  "dam.elcorteingles.es",
]);
const MAXIMO_IMAGENES = 40;
const MAXIMO_BYTES_IMAGEN = 1_500_000;
const MAXIMO_BYTES_TOTAL = 10_000_000;

export type AdjuntoImagenCorreo = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
};

function urlImagenPermitida(valor: string) {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && HOSTS_IMAGEN_PERMITIDOS.has(url.hostname);
  } catch {
    return false;
  }
}

function extensionImagen(tipo: string) {
  if (tipo === "image/png") return "png";
  if (tipo === "image/gif") return "gif";
  if (tipo === "image/webp") return "webp";
  return "jpg";
}

async function leerImagenLimitada(respuesta: Response) {
  if (!respuesta.body) return null;
  const lector = respuesta.body.getReader();
  const fragmentos: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const lectura = await lector.read();
    if (lectura.done) break;
    total += lectura.value.byteLength;
    if (total > MAXIMO_BYTES_IMAGEN) {
      await lector.cancel();
      return null;
    }
    fragmentos.push(lectura.value);
  }
  return Buffer.concat(fragmentos.map((fragmento) => Buffer.from(fragmento)));
}

async function descargarImagen(
  valor: string,
  redirecciones = 0,
): Promise<{ contenido: Buffer; tipo: string } | null> {
  if (!urlImagenPermitida(valor) || redirecciones > 2) return null;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 8_000);
  try {
    const url = new URL(valor);
    const respuesta = await fetch(url, {
      redirect: "manual",
      signal: controlador.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
        Referer: `${url.origin}/`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      },
    });
    if (respuesta.status >= 300 && respuesta.status < 400) {
      const destino = respuesta.headers.get("location");
      return destino
        ? descargarImagen(new URL(destino, url).toString(), redirecciones + 1)
        : null;
    }
    if (!respuesta.ok) return null;
    const tipo = respuesta.headers.get("content-type")?.split(";")[0] ?? "";
    if (!/^image\/(?:jpeg|png|gif|webp)$/.test(tipo)) return null;
    const longitud = Number(respuesta.headers.get("content-length") ?? 0);
    if (longitud > MAXIMO_BYTES_IMAGEN) return null;
    const contenido = await leerImagenLimitada(respuesta);
    return contenido && contenido.length > 0 ? { contenido, tipo } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

export async function adjuntarImagenesLista(lista: ListaCompraCorreo): Promise<{
  lista: ListaCompraCorreo;
  adjuntos: AdjuntoImagenCorreo[];
}> {
  const urls = [
    ...new Set(
      lista.filas.flatMap((fila) =>
        fila.celdas.flatMap((celda) =>
          celda?.imagenProducto ? [celda.imagenProducto] : [],
        ),
      ),
    ),
  ].slice(0, MAXIMO_IMAGENES);
  const cidPorUrl = new Map<string, string>();
  const adjuntos: AdjuntoImagenCorreo[] = [];
  let bytesTotales = 0;

  for (let inicio = 0; inicio < urls.length; inicio += 4) {
    const lote = urls.slice(inicio, inicio + 4);
    const descargas = await Promise.all(lote.map((url) => descargarImagen(url)));
    for (let indice = 0; indice < lote.length; indice += 1) {
      const descarga = descargas[indice];
      if (!descarga || bytesTotales + descarga.contenido.length > MAXIMO_BYTES_TOTAL) {
        continue;
      }
      const cid = `producto-${adjuntos.length + 1}@comparador.kintela.es`;
      bytesTotales += descarga.contenido.length;
      cidPorUrl.set(lote[indice], cid);
      adjuntos.push({
        filename: `producto-${adjuntos.length + 1}.${extensionImagen(descarga.tipo)}`,
        content: descarga.contenido,
        contentType: descarga.tipo,
        cid,
      });
    }
  }

  return {
    lista: {
      ...lista,
      filas: lista.filas.map((fila) => ({
        ...fila,
        celdas: fila.celdas.map((celda) => {
          if (!celda?.imagenProducto) return celda;
          const cid = cidPorUrl.get(celda.imagenProducto);
          return cid ? { ...celda, imagenProducto: `cid:${cid}` } : celda;
        }),
      })),
    },
    adjuntos,
  };
}
