export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGEN_OPEN_FOOD_FACTS = "https://world.openfoodfacts.org";

function marcadorSinImagen() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420">
      <rect width="600" height="420" rx="28" fill="#f7f5ee"/>
      <circle cx="300" cy="180" r="72" fill="#e8eef8"/>
      <text x="300" y="202" text-anchor="middle" font-family="Arial,sans-serif"
            font-size="64" font-weight="700" fill="#1e5aa8">C</text>
      <text x="300" y="292" text-anchor="middle" font-family="Arial,sans-serif"
            font-size="24" font-weight="600" fill="#71837c">Imagen no disponible</text>
    </svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}

export async function GET(request: Request) {
  const ean = new URL(request.url).searchParams.get("ean")?.trim() ?? "";
  if (!/^\d{8,14}$/.test(ean)) return marcadorSinImagen();

  try {
    const url = new URL(`/api/v2/product/${ean}.json`, ORIGEN_OPEN_FOOD_FACTS);
    url.searchParams.set(
      "fields",
      "status,image_front_url,image_front_small_url,image_url",
    );
    const respuesta = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ComparadorKintela/1.0 (info@kintela.es)",
      },
      next: { revalidate: 604800 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) return marcadorSinImagen();

    const datos = (await respuesta.json()) as {
      status?: number;
      product?: {
        image_front_url?: string;
        image_front_small_url?: string;
        image_url?: string;
      };
    };
    const imagen =
      datos.product?.image_front_url ??
      datos.product?.image_front_small_url ??
      datos.product?.image_url;
    if (datos.status !== 1 || !imagen?.startsWith("https://")) {
      return marcadorSinImagen();
    }

    return Response.redirect(imagen, 307);
  } catch {
    return marcadorSinImagen();
  }
}
