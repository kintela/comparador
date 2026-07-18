import "server-only";

import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const COOKIE_SESION_ADMIN = "comparador_admin_session";
export const DURACION_SESION_ADMIN_SEGUNDOS = 12 * 60 * 60;

type ContenidoSesion = {
  version: 1;
  expira: number;
  id: string;
};

function obtenerSecretoAdmin(): string | null {
  const secreto = process.env.ADMIN_RASTREO_TOKEN?.trim();
  return secreto && secreto.length >= 16 ? secreto : null;
}

function sonIguales(valorA: string, valorB: string): boolean {
  const bufferA = Buffer.from(valorA);
  const bufferB = Buffer.from(valorB);
  return (
    bufferA.length === bufferB.length &&
    timingSafeEqual(bufferA, bufferB)
  );
}

function firmar(contenido: string, secreto: string): string {
  return createHmac("sha256", secreto).update(contenido).digest("base64url");
}

export function configuracionAdminValida(): boolean {
  return obtenerSecretoAdmin() !== null;
}

export function validarClaveAdmin(clave: string): boolean {
  const secreto = obtenerSecretoAdmin();
  return secreto !== null && sonIguales(secreto, clave);
}

export function crearSesionAdmin(): string {
  const secreto = obtenerSecretoAdmin();
  if (!secreto) {
    throw new Error("ADMIN_RASTREO_TOKEN no está configurado correctamente");
  }

  const sesion: ContenidoSesion = {
    version: 1,
    expira: Math.floor(Date.now() / 1000) + DURACION_SESION_ADMIN_SEGUNDOS,
    id: randomUUID(),
  };
  const contenido = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  return `${contenido}.${firmar(contenido, secreto)}`;
}

export function validarSesionAdmin(valor: string | undefined): boolean {
  const secreto = obtenerSecretoAdmin();
  if (!secreto || !valor) return false;

  const partes = valor.split(".");
  if (partes.length !== 2) return false;
  const [contenido, firmaRecibida] = partes;
  if (!contenido || !firmaRecibida) return false;

  const firmaEsperada = firmar(contenido, secreto);
  if (!sonIguales(firmaEsperada, firmaRecibida)) return false;

  try {
    const sesion = JSON.parse(
      Buffer.from(contenido, "base64url").toString("utf8"),
    ) as Partial<ContenidoSesion>;
    return (
      sesion.version === 1 &&
      typeof sesion.expira === "number" &&
      sesion.expira > Math.floor(Date.now() / 1000) &&
      typeof sesion.id === "string"
    );
  } catch {
    return false;
  }
}

export function obtenerCookieSesion(request: Request): string | undefined {
  const cabecera = request.headers.get("cookie");
  if (!cabecera) return undefined;

  for (const fragmento of cabecera.split(";")) {
    const [nombre, ...valor] = fragmento.trim().split("=");
    if (nombre === COOKIE_SESION_ADMIN) {
      try {
        return decodeURIComponent(valor.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
