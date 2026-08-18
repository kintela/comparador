import "server-only";

import { Impit } from "impit";
import { CookieJar } from "tough-cookie";

const clienteNavegador = new Impit({
  browser: "chrome",
  cookieJar: new CookieJar(),
  timeout: 45_000,
});

export function fetchComoNavegador(
  recurso: string | URL,
  opciones?: Parameters<Impit["fetch"]>[1],
) {
  return clienteNavegador.fetch(recurso, opciones);
}
