export const runtime = "edge";
export const dynamic = "force-dynamic";

const HOSTS_EROSKI = new Set([
  "supermercado.eroski.es",
  "eroski.eroski-gcp.global.worldline-solutions.com",
]);

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto || request.headers.get("x-internal-secret") !== secreto) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const valorUrl = new URL(request.url).searchParams.get("url");
  if (!valorUrl) {
    return Response.json({ ok: false, error: "Falta la URL" }, { status: 400 });
  }

  let destino: URL;
  try {
    destino = new URL(valorUrl);
  } catch {
    return Response.json({ ok: false, error: "URL no válida" }, { status: 400 });
  }
  if (destino.protocol !== "https:" || !HOSTS_EROSKI.has(destino.hostname)) {
    return Response.json({ ok: false, error: "Destino no permitido" }, { status: 403 });
  }

  const respuesta = await fetch(destino, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
      Referer: `${destino.origin}/es/`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/136.0.0.0 Safari/537.36",
    },
  });
  return new Response(respuesta.body, {
    status: respuesta.status,
    headers: {
      "Content-Type": respuesta.headers.get("content-type") ?? "text/html",
      "Cache-Control": "no-store",
    },
  });
}
