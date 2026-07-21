export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGEN_OPEN_FOOD_FACTS = "https://world.openfoodfacts.org";
const ENDPOINT_BUSQUEDA_CARREFOUR =
  "https://api.empathy.co/search/v1/query/carrefour/search";
const PUNTO_VENTA_CARREFOUR =
  process.env.CARREFOUR_STORE_ID?.trim() || "005457";

type ProductoCarrefourImagen = {
  ean13?: string;
  image_for_play_service?: string;
  image_path?: { food?: string };
};

function esImagenOficialCarrefour(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const imagen = new URL(url);
    return imagen.protocol === "https:" && imagen.hostname === "static.carrefour.es";
  } catch {
    return false;
  }
}

async function buscarImagenOficial(ean: string): Promise<string | null> {
  const url = new URL(ENDPOINT_BUSQUEDA_CARREFOUR);
  for (const [clave, valor] of Object.entries({
    query: ean,
    lang: "es",
    scope: "desktop",
    store: PUNTO_VENTA_CARREFOUR,
    catalog: "food",
    rows: "10",
    start: "0",
  })) {
    url.searchParams.set(clave, valor);
  }
  const respuesta = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 ComparadorKintela/1.0",
    },
    next: { revalidate: 604800 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!respuesta.ok) return null;

  const datos = (await respuesta.json()) as {
    catalog?: { content?: ProductoCarrefourImagen[] };
  };
  const producto = datos.catalog?.content?.find(
    (item) => item.ean13?.trim() === ean,
  );
  const imagen =
    producto?.image_for_play_service ?? producto?.image_path?.food;
  return esImagenOficialCarrefour(imagen) ? imagen : null;
}

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
      "Cache-Control": "no-store, max-age=0",
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
    if (respuesta.ok) {
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
      if (datos.status === 1 && imagen?.startsWith("https://")) {
        return Response.redirect(imagen, 307);
      }
    }

    const imagenCarrefour = await buscarImagenOficial(ean);
    return imagenCarrefour
      ? Response.redirect(imagenCarrefour, 307)
      : marcadorSinImagen();
  } catch {
    return marcadorSinImagen();
  }
}
