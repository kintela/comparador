import { GET as enviarInformeOfertas } from "../informe-ofertas/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  return enviarInformeOfertas(request);
}
