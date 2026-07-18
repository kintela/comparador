const ORIGEN_FOLLETO = "https://folleto.coviran.es/paisvasco";
const ANCHO_PAGINA = 496.063;
const ALTO_PAGINA = 850.394;
const ANCHO_COLUMNA = ANCHO_PAGINA / 3;
const ALTO_RECORTE = 175;

export const dynamic = "force-dynamic";

function entero(
  valor: string | null,
  minimo: number,
  maximo: number,
): number | null {
  if (!valor || !/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  return numero >= minimo && numero <= maximo ? numero : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pagina = entero(url.searchParams.get("pagina"), 1, 99);
  const columna = entero(url.searchParams.get("columna"), 0, 2);
  const yTexto = entero(url.searchParams.get("y"), 0, Math.ceil(ALTO_PAGINA));
  if (pagina === null || columna === null || yTexto === null) {
    return new Response("Parámetros de imagen no válidos", { status: 400 });
  }

  const x = columna * ANCHO_COLUMNA;
  const y = Math.max(0, ALTO_PAGINA - yTexto - ALTO_RECORTE);
  const numeroPagina = String(pagina).padStart(4, "0");
  const imagenPagina =
    `${ORIGEN_FOLLETO}/files/assets/common/page-html5-substrates/` +
    `page${numeroPagina}_1.jpg`;
  const respuestaImagen = await fetch(imagenPagina, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuestaImagen.ok) {
    return new Response("Covirán no devolvió la imagen del folleto", {
      status: 502,
    });
  }
  const tipoImagen =
    respuestaImagen.headers.get("content-type") ?? "image/jpeg";
  const imagenBase64 = Buffer.from(
    await respuestaImagen.arrayBuffer(),
  ).toString("base64");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
      width="600" height="440"
      viewBox="${x.toFixed(3)} ${y.toFixed(3)} ${ANCHO_COLUMNA.toFixed(3)} ${ALTO_RECORTE}">
      <rect x="${x.toFixed(3)}" y="${y.toFixed(3)}"
        width="${ANCHO_COLUMNA.toFixed(3)}" height="${ALTO_RECORTE}"
        fill="#f7f5ee"/>
      <image href="data:${tipoImagen};base64,${imagenBase64}" x="0" y="0"
        width="${ANCHO_PAGINA}" height="${ALTO_PAGINA}"
        preserveAspectRatio="none"/>
    </svg>
  `.trim();

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Security-Policy": "default-src 'none'; img-src data:",
    },
  });
}
