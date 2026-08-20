"use client";

import Image from "next/image";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { puntuacionRelevanciaProducto } from "@/servicios/busqueda/relevancia-producto";
import {
  calcularCosteArticulo,
  crearReferenciaComparacionAutomatica,
  etiquetaCantidadArticulo,
  obtenerPesoMedioPiezaKg,
  type ReferenciaComparacion,
} from "@/servicios/lista-compra/calculo-cantidades";

type Oferta = {
  supermercado: string;
  tienda: string;
  municipio: string | null;
  precio: number;
  precioReferencia: number | null;
  unidadReferencia: string | null;
  disponible: boolean;
  urlProducto: string | null;
};

type Producto = {
  id: string;
  nombre: string;
  imagen: string | null;
  categoria: string | null;
  ofertas: Oferta[];
};

type RespuestaBusqueda = {
  ok: boolean;
  terminoResuelto?: string;
  productos?: Producto[];
  solicitudRastreo?: { registrada: boolean } | null;
  error?: string;
};

type ArticuloLista = {
  id: string;
  termino: string;
  cantidad: number;
  unidadCantidad: "UD" | "KG" | "L";
};

type ArticuloCompartido = [
  termino: string,
  cantidad: number,
  unidadCantidad: ArticuloLista["unidadCantidad"],
];

type MejorPrecio = {
  precio: number;
  precioReferencia: number | null;
  unidadReferencia: string | null;
  nombreProducto: string;
  imagenProducto: string | null;
  urlProducto: string | null;
  relevancia: number;
};

type ResultadoArticulo = {
  articuloId: string;
  terminoResuelto: string;
  precios: Record<string, MejorPrecio>;
  referenciaComparacion: ReferenciaComparacion | null;
  enCola: boolean;
  error: string | null;
};

const SUPERMERCADOS = [
  "Alcampo",
  "ALDI",
  "BM Supermercados",
  "Carrefour",
  "Costco",
  "Covirán",
  "DIA",
  "El Corte Inglés",
  "Eroski",
  "Lidl",
  "Lupa",
  "Mercadona",
  "Primaprix",
] as const;

const CLAVE_LISTA = "comparador-lista-compra-v1";
const PARAMETRO_LISTA_COMPARTIDA = "lista";
const URL_PUBLICA_LISTA = "https://comparador.kintela.es/lista-compra";
const REFERENCIA_UN_KILO: ReferenciaComparacion = {
  cantidad: 1,
  unidad: "KG",
  cantidadBase: 1000,
  unidadVisual: "g",
};
const REFERENCIA_UN_LITRO: ReferenciaComparacion = {
  cantidad: 1,
  unidad: "L",
  cantidadBase: 1000,
  unidadVisual: "ml",
};

function crearId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function codificarListaCompartida(articulos: ArticuloLista[]) {
  const contenido: ArticuloCompartido[] = articulos.map((articulo) => [
    articulo.termino,
    articulo.cantidad,
    articulo.unidadCantidad,
  ]);
  const bytes = new TextEncoder().encode(JSON.stringify(contenido));
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function decodificarListaCompartida(valor: string): ArticuloLista[] | null {
  if (!valor || valor.length > 8000) return null;

  try {
    const base64 = valor
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(valor.length / 4) * 4, "=");
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, (caracter) =>
      caracter.charCodeAt(0),
    );
    const contenido = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as unknown;
    if (!Array.isArray(contenido) || contenido.length === 0) return null;

    const articulos = contenido.slice(0, 20).map((item) => {
      if (!Array.isArray(item) || item.length !== 3) return null;
      const [terminoOriginal, cantidad, unidadCantidad] = item;
      const termino =
        typeof terminoOriginal === "string"
          ? terminoOriginal.trim().replace(/\s+/g, " ")
          : "";
      if (
        termino.length < 2 ||
        termino.length > 80 ||
        typeof cantidad !== "number" ||
        !Number.isFinite(cantidad) ||
        !["UD", "KG", "L"].includes(String(unidadCantidad))
      ) {
        return null;
      }
      const unidad = unidadCantidad as ArticuloLista["unidadCantidad"];
      const cantidadMinima = unidad === "UD" ? 1 : 0.25;
      const cantidadMaxima = unidad === "UD" ? 20 : 50;
      if (
        cantidad < cantidadMinima ||
        cantidad > cantidadMaxima ||
        (unidad === "UD" && !Number.isInteger(cantidad))
      ) {
        return null;
      }
      return {
        id: crearId(),
        termino,
        cantidad,
        unidadCantidad: unidad,
      } satisfies ArticuloLista;
    });

    return articulos.every(
      (articulo): articulo is ArticuloLista => articulo !== null,
    )
      ? articulos
      : null;
  } catch {
    return null;
  }
}

function normalizarTermino(termino: string) {
  return termino
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
}

function esProductoAdecuadoParaLista(
  nombreProducto: string,
  consulta: string,
) {
  const termino = normalizarTermino(consulta);
  const nombre = normalizarTermino(nombreProducto);

  if (["brocoli", "brocolis"].includes(termino)) {
    if (!/\bbrocolis?\b/.test(nombre)) return false;
    return !/\b(coliflor|zanahoria|pescado|filete|cobertura|mezcla|mix|crema|sopa|pure|tortilla|pizza|pasta|arroz|espinaca|platano|pina|smoothie|tarrito|ensalada|kit)\b/.test(
      nombre,
    );
  }

  if (["tomate", "tomates"].includes(termino)) {
    if (!/\btomates?\b/.test(nombre)) return false;
    return !/\b(frito|frita|triturado|triturada|rallado|rallada|pelado|pelada|seco|seca|concentrado|concentrada|cocinado|cocinada|guisado|guisada|preparado|preparada|salsa|sofrito|ketchup|gazpacho|salmorejo|zumo|jugo|pure|crema|conserva|brik|brick|lata|bote|frasco|pizza|pasta)\b/.test(
      nombre,
    );
  }

  if (["melon", "melones"].includes(termino)) {
    if (!/\bmelon(?:es)?\b/.test(nombre)) return false;
    return !/\b(sandias?|golosina|gominola|caramelo|chicle|bolsa|semilla|semillas)\b/.test(
      nombre,
    );
  }

  if (["sandia", "sandias"].includes(termino)) {
    if (!/\bsandias?\b/.test(nombre)) return false;
    return !/\bmelon(?:es)?\b/.test(nombre);
  }

  return true;
}

function moneda(valor: number) {
  return valor.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}

function cantidadTexto(valor: number) {
  return valor.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

function requiereCargaDirecta(url: string) {
  if (
    url.startsWith("/api/imagenes/coviran") ||
    url.startsWith("/api/imagenes/carrefour")
  ) {
    return true;
  }
  try {
    return [
      "supermercado.eroski.es",
      "www.lupaonline.com",
      "www.compraonline.alcampo.es",
      "www.dia.es",
    ].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function CalculadoraLista() {
  const [entrada, setEntrada] = useState("");
  const [articulos, setArticulos] = useState<ArticuloLista[]>([]);
  const [resultados, setResultados] = useState<ResultadoArticulo[] | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeCompartir, setMensajeCompartir] = useState<string | null>(null);
  const [inicializada, setInicializada] = useState(false);
  const cargarListaCompartida = useEffectEvent(
    async (compartida: ArticuloLista[]) => {
      await calcular(compartida);
      setMensajeCompartir(
        "Lista compartida cargada con los precios actuales.",
      );
    },
  );

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      try {
        const valorCompartido = new URLSearchParams(window.location.search).get(
          PARAMETRO_LISTA_COMPARTIDA,
        );
        if (valorCompartido) {
          const compartida = decodificarListaCompartida(valorCompartido);
          if (compartida) {
            setArticulos(compartida);
            setMensajeCompartir(
              "Lista compartida cargada. Actualizando los precios…",
            );
            void cargarListaCompartida(compartida);
            return;
          }
          setMensajeCompartir("El enlace de la lista compartida no es válido.");
        }

        const guardada = localStorage.getItem(CLAVE_LISTA);
        if (guardada) {
          const datos = JSON.parse(guardada) as ArticuloLista[];
          if (Array.isArray(datos)) {
            setArticulos(
              datos
                .filter(
                  (item) =>
                    typeof item.id === "string" &&
                    typeof item.termino === "string" &&
                    typeof item.cantidad === "number",
                )
                .map((item) => ({
                  ...item,
                  unidadCantidad:
                    item.unidadCantidad === "KG" || item.unidadCantidad === "L"
                      ? item.unidadCantidad
                      : "UD" as const,
                }))
                .slice(0, 20),
            );
          }
        }
      } catch {
        localStorage.removeItem(CLAVE_LISTA);
      } finally {
        setInicializada(true);
      }
    }, 0);

    return () => window.clearTimeout(temporizador);
  }, []);

  useEffect(() => {
    if (!inicializada) return;
    localStorage.setItem(CLAVE_LISTA, JSON.stringify(articulos));
  }, [articulos, inicializada]);

  const totales = useMemo(() => {
    if (!resultados) return [];

    return SUPERMERCADOS.map((supermercado) => {
      let total = 0;
      let encontrados = 0;
      let estimado = false;
      let comparable = false;

      for (const articulo of articulos) {
        const resultado = resultados.find(
          (item) => item.articuloId === articulo.id,
        );
        const precio = resultado?.precios[supermercado];
        if (!precio) continue;
        const calculo = calcularCosteArticulo({
          consulta: resultado?.terminoResuelto ?? articulo.termino,
          cantidad: articulo.cantidad,
          precio: precio.precio,
          precioReferencia: precio.precioReferencia,
          unidadReferencia: precio.unidadReferencia,
          nombreProducto: precio.nombreProducto,
          referenciaComparacion: resultado?.referenciaComparacion,
        });
        total += calculo.total;
        estimado ||= calculo.estimado;
        comparable ||= calculo.normalizado;
        encontrados += 1;
      }

      return {
        supermercado,
        total,
        encontrados,
        estimado,
        comparable,
        completa: articulos.length > 0 && encontrados === articulos.length,
      };
    });
  }, [articulos, resultados]);

  function anadirArticulos(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nuevos = entrada
      .split(/[\n,;]+/)
      .map((termino) => termino.trim().replace(/\s+/g, " "))
      .filter((termino) => termino.length >= 2 && termino.length <= 80);

    if (nuevos.length === 0) {
      setMensaje("Escribe al menos un producto.");
      return;
    }

    const existentes = new Set(articulos.map((item) => normalizarTermino(item.termino)));
    const unicos = nuevos.filter((termino) => {
      const normalizado = normalizarTermino(termino);
      if (existentes.has(normalizado)) return false;
      existentes.add(normalizado);
      return true;
    });

    const disponibles = Math.max(0, 20 - articulos.length);
    setArticulos((actuales) => [
      ...actuales,
      ...unicos.slice(0, disponibles).map((termino) => ({
        id: crearId(),
        termino,
        cantidad: 1,
        unidadCantidad: "UD" as const,
      })),
    ]);
    setEntrada("");
    setResultados(null);
    setMensaje(
      unicos.length > disponibles
        ? "La lista admite un máximo de 20 productos."
        : null,
    );
  }

  function cambiarCantidad(id: string, direccion: -1 | 1) {
    setArticulos((actuales) =>
      actuales.map((articulo) =>
        articulo.id === id
          ? {
              ...articulo,
              cantidad: Math.min(
                articulo.unidadCantidad === "UD" ? 20 : 50,
                Math.max(
                  articulo.unidadCantidad === "UD" ? 1 : 0.25,
                  Math.round(
                    (articulo.cantidad +
                      direccion * (articulo.unidadCantidad === "UD" ? 1 : 0.25)) *
                      100,
                  ) / 100,
                ),
              ),
            }
          : articulo,
      ),
    );
    setResultados(null);
  }

  function cambiarUnidadCantidad(
    id: string,
    unidadCantidad: ArticuloLista["unidadCantidad"],
  ) {
    setArticulos((actuales) =>
      actuales.map((articulo) =>
        articulo.id === id
          ? {
              ...articulo,
              unidadCantidad,
              cantidad:
                unidadCantidad === "UD"
                  ? Math.max(1, Math.round(articulo.cantidad))
                  : articulo.cantidad,
            }
          : articulo,
      ),
    );
    setResultados(null);
  }

  async function calcular(articulosObjetivo = articulos) {
    if (articulosObjetivo.length === 0 || calculando) return;
    setCalculando(true);
    setMensaje(null);
    setResultados(null);

    const respuestas = await Promise.all(
      articulosObjetivo.map(async (articulo): Promise<ResultadoArticulo> => {
        try {
          const parametros = new URLSearchParams({
            q: articulo.termino,
            limite: "100",
            cobertura: "1",
          });
          for (const supermercado of SUPERMERCADOS) {
            parametros.append("supermercado", supermercado);
          }

          const respuesta = await fetch(
            `/api/productos/buscar?${parametros.toString()}`,
            { cache: "no-store" },
          );
          const datos = (await respuesta.json()) as RespuestaBusqueda;
          if (!respuesta.ok || !datos.ok) {
            throw new Error(datos.error ?? "No se pudo consultar este producto");
          }

          const precios: Record<string, MejorPrecio> = {};
          const productos = datos.productos ?? [];
          const terminoResuelto = datos.terminoResuelto ?? articulo.termino;
          const candidatos = productos
            .map((producto) => ({
              producto,
              relevancia: puntuacionRelevanciaProducto(
                producto.nombre,
                terminoResuelto,
              ),
            }))
            .filter(
              ({ producto, relevancia }) =>
                relevancia > 0 &&
                esProductoAdecuadoParaLista(
                  producto.nombre,
                  terminoResuelto,
                ),
            );
          const referenciaComparacion =
            articulo.unidadCantidad === "KG"
              ? REFERENCIA_UN_KILO
              : articulo.unidadCantidad === "L"
                ? REFERENCIA_UN_LITRO
              : crearReferenciaComparacionAutomatica(
                  terminoResuelto,
                  candidatos.flatMap(({ producto }) =>
                    producto.ofertas.map((oferta) => ({
                      nombreProducto: producto.nombre,
                      precioReferencia: oferta.precioReferencia,
                      unidadReferencia: oferta.unidadReferencia,
                    })),
                  ),
                );

          for (const { producto, relevancia } of candidatos) {
            for (const oferta of producto.ofertas) {
              if (!oferta.disponible || !SUPERMERCADOS.includes(
                oferta.supermercado as (typeof SUPERMERCADOS)[number],
              )) {
                continue;
              }
              const actual = precios[oferta.supermercado];
              const calculoUnitario = calcularCosteArticulo({
                consulta: terminoResuelto,
                cantidad: 1,
                precio: oferta.precio,
                precioReferencia: oferta.precioReferencia,
                unidadReferencia: oferta.unidadReferencia,
                nombreProducto: producto.nombre,
                referenciaComparacion,
              });
              // Si existe una unidad común, no mezclamos en la misma fila
              // envases cuya cantidad no se puede convertir con seguridad.
              if (referenciaComparacion && !calculoUnitario.normalizado) continue;
              const costeUnitario = calculoUnitario.total;
              const calculoActual = actual
                ? calcularCosteArticulo({
                    consulta: terminoResuelto,
                    cantidad: 1,
                    precio: actual.precio,
                    precioReferencia: actual.precioReferencia,
                    unidadReferencia: actual.unidadReferencia,
                    nombreProducto: actual.nombreProducto,
                    referenciaComparacion,
                  })
                : null;
              const costeActual = calculoActual?.total ?? Infinity;
              if (
                !actual ||
                relevancia > actual.relevancia ||
                (relevancia === actual.relevancia &&
                  costeUnitario < costeActual)
              ) {
                precios[oferta.supermercado] = {
                  precio: oferta.precio,
                  precioReferencia: oferta.precioReferencia,
                  unidadReferencia: oferta.unidadReferencia,
                  nombreProducto: producto.nombre,
                  imagenProducto: producto.imagen,
                  urlProducto: oferta.urlProducto,
                  relevancia,
                };
              }
            }
          }

          return {
            articuloId: articulo.id,
            terminoResuelto,
            precios,
            referenciaComparacion,
            enCola:
              Object.keys(precios).length === 0 &&
              Boolean(datos.solicitudRastreo?.registrada),
            error: null,
          };
        } catch (error) {
          return {
            articuloId: articulo.id,
            terminoResuelto: articulo.termino,
            precios: {},
            referenciaComparacion: null,
            enCola: false,
            error:
              error instanceof Error
                ? error.message
                : "No se pudo consultar este producto",
          };
        }
      }),
    );

    setResultados(respuestas);
    setCalculando(false);
  }

  async function copiarEnlaceLista() {
    const url = new URL(URL_PUBLICA_LISTA);
    url.searchParams.set(
      PARAMETRO_LISTA_COMPARTIDA,
      codificarListaCompartida(articulos),
    );

    try {
      await navigator.clipboard.writeText(url.toString());
      setMensajeCompartir("Enlace de la lista copiado.");
    } catch {
      window.prompt("Copia este enlace para compartir la lista:", url.toString());
      setMensajeCompartir("Enlace preparado para compartir.");
    }
  }

  return (
    <div className="mt-10 space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-[#17352b]/10 bg-white p-5 shadow-[0_18px_55px_rgba(23,53,43,0.08)] sm:p-7">
          <h2 className="text-xl font-bold">Añade productos</h2>
          <p className="mt-1 text-sm leading-6 text-[#71837c]">
            Puedes escribir uno o varios separados por comas o en líneas distintas.
          </p>
          <form onSubmit={anadirArticulos} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-[#17352b]/15 bg-[#f7f5ee]/60 px-4 focus-within:border-[#176b50]/60">
              <span aria-hidden="true" className="text-xl text-[#176b50]">+</span>
              <span className="sr-only">Productos para añadir</span>
              <input
                value={entrada}
                onChange={(evento) => setEntrada(evento.target.value)}
                maxLength={500}
                placeholder="Ej.: leche, huevos, pan…"
                className="h-12 w-full bg-transparent outline-none placeholder:text-[#8d9b96]"
              />
            </label>
            <button
              type="submit"
              disabled={articulos.length >= 20}
              className="h-12 rounded-xl bg-[#176b50] px-6 font-bold text-white transition hover:bg-[#125740] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Añadir a la lista
            </button>
          </form>
          {mensaje && <p className="mt-3 text-sm font-semibold text-[#a56600]">{mensaje}</p>}
        </div>

        <div className="flex flex-col justify-between rounded-3xl bg-[#17352b] p-6 text-white shadow-[0_18px_55px_rgba(23,53,43,0.16)]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#82d4b6]">
              Tu lista
            </p>
            <p className="mt-2 text-3xl font-extrabold">
              {articulos.length} {articulos.length === 1 ? "producto" : "productos"}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Compararemos hasta 12 supermercados con los últimos precios disponibles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void calcular()}
            disabled={articulos.length === 0 || calculando}
            className="mt-6 h-12 rounded-xl bg-[#f4c95d] px-5 font-extrabold text-[#17352b] transition hover:bg-[#f7d778] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {calculando ? "Calculando precios…" : "Calcular lista"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-[#17352b]/10 bg-white p-4 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Productos de la lista</h2>
            <p className="mt-1 text-sm text-[#71837c]">
              Ajusta la cantidad y elige si la necesitas por unidades, kilos o litros.
            </p>
          </div>
          {articulos.length > 0 && (
            <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-start">
              <button
                type="button"
                onClick={() => void copiarEnlaceLista()}
                className="inline-flex items-center gap-2 rounded-lg border border-[#176b50]/20 bg-[#e7f5ee] px-3 py-2 text-sm font-bold text-[#176b50] transition hover:border-[#176b50]/40 hover:bg-[#d9efe5]"
              >
                <span aria-hidden="true">↗</span>
                Copiar enlace
              </button>
              <button
                type="button"
                onClick={() => {
                  setArticulos([]);
                  setResultados(null);
                  setMensajeCompartir(null);
                }}
                className="text-sm font-bold text-[#a24a3f] hover:underline"
              >
                Vaciar lista
              </button>
            </div>
          )}
        </div>

        {mensajeCompartir && (
          <p
            className="mt-4 rounded-xl border border-[#16805e]/20 bg-[#e7f5ee] px-4 py-3 text-sm font-semibold text-[#176b50]"
            role="status"
          >
            {mensajeCompartir}
          </p>
        )}

        {articulos.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#17352b]/20 bg-[#f7f5ee]/60 px-6 py-12 text-center text-[#71837c]">
            Tu lista está vacía. Empieza escribiendo un producto arriba.
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {articulos.map((articulo, indice) => (
              <li
                key={articulo.id}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[#17352b]/10 bg-[#f7f5ee]/70 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-extrabold text-[#176b50]">
                    {indice + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold" title={articulo.termino}>
                      {articulo.termino}
                    </p>
                    {articulo.unidadCantidad === "KG" ? (
                      <p className="mt-0.5 text-xs text-[#71837c]">
                        Cantidad solicitada por peso
                      </p>
                    ) : articulo.unidadCantidad === "L" ? (
                      <p className="mt-0.5 text-xs text-[#71837c]">
                        Cantidad solicitada por volumen
                      </p>
                    ) : obtenerPesoMedioPiezaKg(articulo.termino) !== null && (
                      <p className="mt-0.5 text-xs text-[#71837c]">
                        Por piezas · ≈{" "}
                        {Math.round(
                          (obtenerPesoMedioPiezaKg(articulo.termino) ?? 0) * 1000,
                        )}{" "}
                        g cada una
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 items-center justify-end gap-2 pl-12">
                  <div className="flex shrink-0 items-center rounded-lg border border-[#17352b]/10 bg-white">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(articulo.id, -1)}
                      aria-label={`Reducir cantidad de ${articulo.termino}`}
                      className="grid size-10 place-items-center text-lg text-[#60766e] hover:text-[#176b50] sm:size-8"
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-sm font-extrabold">
                      {cantidadTexto(articulo.cantidad)}
                    </span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(articulo.id, 1)}
                      aria-label={`Aumentar cantidad de ${articulo.termino}`}
                      className="grid size-10 place-items-center text-lg text-[#60766e] hover:text-[#176b50] sm:size-8"
                    >
                      +
                    </button>
                  </div>
                  <select
                    value={articulo.unidadCantidad}
                    onChange={(evento) =>
                      cambiarUnidadCantidad(
                        articulo.id,
                        evento.target.value === "KG"
                          ? "KG"
                          : evento.target.value === "L"
                            ? "L"
                            : "UD",
                      )
                    }
                    aria-label={`Unidad de cantidad de ${articulo.termino}`}
                    className="h-10 min-w-16 rounded-lg border border-[#17352b]/10 bg-white px-2 text-sm font-bold text-[#17352b] outline-none focus:border-[#176b50] sm:h-8"
                  >
                    <option value="UD">ud.</option>
                    <option value="KG">kg</option>
                    <option value="L">lt</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setArticulos((actuales) =>
                        actuales.filter((item) => item.id !== articulo.id),
                      );
                      setResultados(null);
                    }}
                    aria-label={`Eliminar ${articulo.termino}`}
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-[#8c9a95] hover:bg-red-50 hover:text-red-600 sm:size-8"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {calculando && <EstadoCalculando articulos={articulos.length} />}

      {resultados && (
        <TablaComparacion
          articulos={articulos}
          resultados={resultados}
          totales={totales}
        />
      )}
    </div>
  );
}

function EstadoCalculando({ articulos }: { articulos: number }) {
  return (
    <div className="rounded-3xl border border-[#176b50]/15 bg-[#e7f5ee] px-6 py-10 text-center" aria-live="polite">
      <span className="mx-auto block size-8 animate-spin rounded-full border-4 border-[#176b50]/20 border-t-[#176b50]" />
      <p className="mt-4 font-bold">Comparando {articulos} productos…</p>
      <p className="mt-1 text-sm text-[#60766e]">Consultamos los últimos precios del catálogo.</p>
    </div>
  );
}

function TablaComparacion({
  articulos,
  resultados,
  totales,
}: {
  articulos: ArticuloLista[];
  resultados: ResultadoArticulo[];
  totales: Array<{
    supermercado: string;
    total: number;
    encontrados: number;
    estimado: boolean;
    comparable: boolean;
    completa: boolean;
  }>;
}) {
  const [supermercadosVisibles, setSupermercadosVisibles] = useState<string[]>([
    ...SUPERMERCADOS,
  ]);
  const [soloCestasCompletas, setSoloCestasCompletas] = useState(false);
  const ordenOriginal = new Map<string, number>(
    SUPERMERCADOS.map((supermercado, indice) => [supermercado, indice]),
  );
  const numeroCestasCompletas = totales.filter((total) => total.completa).length;
  const totalesVisibles = totales
    .filter(
      (total) =>
        supermercadosVisibles.includes(total.supermercado) &&
        (!soloCestasCompletas || total.completa),
    )
    .sort((a, b) => {
      if (a.completa !== b.completa) return a.completa ? -1 : 1;
      if (a.completa && b.completa) return a.total - b.total;
      return (
        (ordenOriginal.get(a.supermercado) ?? Infinity) -
        (ordenOriginal.get(b.supermercado) ?? Infinity)
      );
    });
  const visibles = totalesVisibles.map((total) => total.supermercado);
  const completas = totalesVisibles.filter((total) => total.completa);
  const totalMasBarato = Math.min(
    ...completas.map((total) => total.total),
  );
  const ganadores = completas.filter(
    (total) => total.total === totalMasBarato,
  );
  const usaCantidadesComparables = completas.some(
    (total) => total.comparable,
  );
  const contenedorTabla = useRef<HTMLDivElement>(null);

  function desplazarTabla(direccion: -1 | 1) {
    contenedorTabla.current?.scrollBy({
      left: direccion * Math.min(window.innerWidth * 0.7, 720),
      behavior: "smooth",
    });
  }

  return (
    <section className="-mx-5 overflow-hidden border-y border-[#17352b]/10 bg-white shadow-[0_18px_55px_rgba(23,53,43,0.08)] sm:mx-0 sm:rounded-3xl sm:border">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#17352b]/10 px-4 py-5 sm:px-7 sm:py-6">
        <div>
          <p className="text-sm font-semibold text-[#16805e]">Comparación</p>
          <h2 className="mt-1 text-2xl font-bold">Precio de tu lista</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71837c]">
            Cada celda muestra la opción coincidente más barata del supermercado.
            Desliza horizontalmente para verlos todos.
          </p>
        </div>
        {completas.length > 0 ? (
          <div className="w-full rounded-2xl bg-[#e7f5ee] px-5 py-3 text-right sm:w-auto">
            <p className="text-xs font-bold uppercase tracking-wide text-[#16805e]">
              {usaCantidadesComparables
                ? "Mejor total comparable"
                : "Mejor total completo"}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[#176b50]">
              {totalesVisibles.some(
                (total) =>
                  total.completa &&
                  total.total === totalMasBarato &&
                  total.estimado,
              )
                ? "≈ "
                : ""}
              {moneda(totalMasBarato)}
            </p>
            <p className="mt-1 text-sm font-extrabold text-[#17352b]">
              {ganadores.map((ganador) => ganador.supermercado).join(" · ")}
            </p>
          </div>
        ) : (
          <div className="max-w-sm rounded-2xl bg-[#fff8e8] px-5 py-3 text-sm font-semibold leading-6 text-[#8a5700]">
            Ningún supermercado tiene todavía precio para toda la lista.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#17352b]/10 bg-[#f7f5ee]/70 px-4 py-3 sm:px-7">
        <div className="w-full sm:w-auto">
          <p className="text-xs font-semibold text-[#60766e]">
            Desplázate horizontalmente para ver todos los supermercados
          </p>
          {supermercadosVisibles.length < SUPERMERCADOS.length && (
            <button
              type="button"
              onClick={() => setSupermercadosVisibles([...SUPERMERCADOS])}
              className="mt-1 text-xs font-bold text-[#176b50] hover:underline"
            >
              Mostrar todos ({SUPERMERCADOS.length - supermercadosVisibles.length} ocultos)
            </button>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={() => setSoloCestasCompletas((actual) => !actual)}
            disabled={numeroCestasCompletas === 0}
            aria-pressed={soloCestasCompletas}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9 sm:flex-none ${
              soloCestasCompletas
                ? "border-[#176b50] bg-[#176b50] text-white"
                : "border-[#17352b]/15 bg-white text-[#17352b] hover:border-[#176b50]/40 hover:bg-[#e7f5ee]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid size-4 place-items-center rounded border text-[10px] ${
                soloCestasCompletas
                  ? "border-white/60 bg-white text-[#176b50]"
                  : "border-[#17352b]/25"
              }`}
            >
              {soloCestasCompletas ? "✓" : ""}
            </span>
            Solo listas completas ({numeroCestasCompletas})
          </button>
          <button
            type="button"
            onClick={() => desplazarTabla(-1)}
            aria-label="Ver supermercados anteriores"
            className="grid size-9 place-items-center rounded-lg border border-[#17352b]/15 bg-white text-lg font-bold text-[#176b50] transition hover:border-[#176b50]/40 hover:bg-[#e7f5ee]"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => desplazarTabla(1)}
            aria-label="Ver supermercados siguientes"
            className="grid size-9 place-items-center rounded-lg border border-[#17352b]/15 bg-white text-lg font-bold text-[#176b50] transition hover:border-[#176b50]/40 hover:bg-[#e7f5ee]"
          >
            →
          </button>
        </div>
      </div>

      <div
        ref={contenedorTabla}
        className="scrollbar-tabla max-h-[75svh] overflow-auto overscroll-contain sm:max-h-[70vh]"
        tabIndex={0}
        aria-label="Tabla comparativa desplazable horizontal y verticalmente"
      >
        <table className="w-max min-w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#f7f5ee]">
              <th className="sticky left-0 top-0 z-40 w-28 min-w-28 max-w-28 border-b border-r border-[#17352b]/10 bg-[#f7f5ee] px-3 py-3 text-xs font-bold shadow-[0_1px_0_rgba(23,53,43,0.1)] sm:w-56 sm:min-w-56 sm:max-w-56 sm:px-5 sm:py-4 sm:text-sm">
                Producto
              </th>
              {visibles.map((supermercado) => (
                <th key={supermercado} className="sticky top-0 z-30 min-w-36 border-b border-[#17352b]/10 bg-[#f7f5ee] px-3 py-3 text-center text-xs font-bold shadow-[0_1px_0_rgba(23,53,43,0.1)] sm:min-w-40 sm:px-4 sm:py-4 sm:text-sm">
                  <div className="flex items-center justify-center gap-2">
                    <span>{supermercado}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSupermercadosVisibles((actuales) =>
                          actuales.filter((nombre) => nombre !== supermercado),
                        )
                      }
                      disabled={visibles.length === 1}
                      aria-label={`Ocultar ${supermercado}`}
                      title={`Ocultar ${supermercado}`}
                      className="grid size-6 shrink-0 place-items-center rounded-md border border-[#17352b]/15 bg-white text-sm font-bold text-[#71837c] transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {articulos.map((articulo) => {
              const resultado = resultados.find((item) => item.articuloId === articulo.id);
              const calculosFila = new Map<
                string,
                ReturnType<typeof calcularCosteArticulo>
              >();
              for (const supermercado of visibles) {
                const precio = resultado?.precios[supermercado];
                if (!precio) continue;
                calculosFila.set(
                  supermercado,
                  calcularCosteArticulo({
                    consulta: resultado?.terminoResuelto ?? articulo.termino,
                    cantidad: articulo.cantidad,
                    precio: precio.precio,
                    precioReferencia: precio.precioReferencia,
                    unidadReferencia: precio.unidadReferencia,
                    nombreProducto: precio.nombreProducto,
                    referenciaComparacion: resultado?.referenciaComparacion,
                  }),
                );
              }
              const costeMasBaratoFila = Math.min(
                ...[...calculosFila.values()].map((calculo) => calculo.total),
              );
              return (
                <tr key={articulo.id} className="border-b border-[#17352b]/8 last:border-b-0">
                  <th className="sticky left-0 z-10 w-28 min-w-28 max-w-28 border-r border-[#17352b]/10 bg-white px-3 py-3 align-top sm:w-56 sm:min-w-56 sm:max-w-56 sm:px-5 sm:py-4">
                    <p className="break-words text-sm font-bold sm:text-base">{articulo.termino}</p>
                    <p className="mt-1 text-xs font-medium text-[#71837c]">
                      {cantidadTexto(articulo.cantidad)}{" "}
                      {etiquetaCantidadArticulo(
                        resultado?.terminoResuelto ?? articulo.termino,
                        articulo.cantidad,
                        resultado?.referenciaComparacion,
                        articulo.unidadCantidad,
                      )}
                    </p>
                    {resultado?.enCola && <p className="mt-2 text-xs font-semibold text-[#a56600]">Añadido a la cola de rastreo</p>}
                    {resultado?.error && <p className="mt-2 max-w-48 text-xs font-semibold text-red-600">{resultado.error}</p>}
                  </th>
                  {visibles.map((supermercado) => {
                    const precio = resultado?.precios[supermercado];
                    const calculo = calculosFila.get(supermercado) ?? null;
                    const masBarato =
                      calculo !== null &&
                      Math.abs(calculo.total - costeMasBaratoFila) < 0.005;
                    return (
                      <td
                        key={supermercado}
                        className={`px-3 py-3 text-center align-top transition-colors sm:px-4 sm:py-4 ${
                          masBarato
                            ? "bg-[#fff9df] shadow-[inset_0_0_0_2px_#f4c95d]"
                            : ""
                        }`}
                      >
                        {precio ? (
                          <div>
                            {masBarato && (
                              <span className="mb-3 inline-flex rounded-full bg-[#f4c95d] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#17352b]">
                                Más barato
                              </span>
                            )}
                            {precio.imagenProducto && (
                              <a
                                href={precio.urlProducto ?? precio.imagenProducto}
                                target="_blank"
                                rel="noreferrer"
                                className="relative mx-auto mb-3 block size-16 overflow-hidden rounded-xl bg-[#f7f5ee] sm:size-20"
                                aria-label={`Ver ${precio.nombreProducto}`}
                              >
                                <Image
                                  src={precio.imagenProducto}
                                  alt={precio.nombreProducto}
                                  fill
                                  unoptimized={requiereCargaDirecta(
                                    precio.imagenProducto,
                                  )}
                                  sizes="(max-width: 639px) 64px, 80px"
                                  className="object-contain p-1.5"
                                />
                              </a>
                            )}
                            {precio.urlProducto ? (
                              <a href={precio.urlProducto} target="_blank" rel="noreferrer" className="text-base font-extrabold text-[#176b50] hover:underline sm:text-lg">
                                {calculo?.estimado ? "≈ " : ""}
                                {moneda(calculo?.total ?? 0)}
                              </a>
                            ) : (
                              <p className="text-base font-extrabold text-[#176b50] sm:text-lg">
                                {calculo?.estimado ? "≈ " : ""}
                                {moneda(calculo?.total ?? 0)}
                              </p>
                            )}
                            {calculo?.normalizado ? (
                              <>
                                <p className="mt-1 text-xs font-semibold text-[#16805e]">
                                  por {calculo.cantidadComparableTexto}
                                </p>
                                {calculo.cantidadEnvaseTexto && (
                                  <p className="mt-1 text-xs text-[#71837c]">
                                    Envase: {moneda(precio.precio)} ·{" "}
                                    {calculo.cantidadEnvaseTexto}
                                  </p>
                                )}
                                <p className="mt-1 text-xs text-[#71837c]">
                                  {moneda(calculo.precioKg ?? 0)} /{calculo.unidadComparable}
                                </p>
                                {calculo.notaComparacion && (
                                  <p className="mt-1 text-[10px] leading-4 text-[#8a6a2f]">
                                    {calculo.notaComparacion}
                                  </p>
                                )}
                              </>
                            ) : calculo?.estimado ? (
                              <>
                                <p className="mt-1 text-xs font-semibold text-[#16805e]">
                                  ≈ {moneda(calculo.precioPorPieza ?? 0)} / pieza
                                </p>
                                <p className="mt-1 text-xs text-[#71837c]">
                                  {moneda(calculo.precioKg ?? 0)} / kg · peso
                                  estimado {Math.round((calculo.pesoMedioPiezaKg ?? 0) * 1000)} g
                                </p>
                              </>
                            ) : (
                              articulo.cantidad > 1 && (
                                <p className="mt-1 text-xs text-[#71837c]">
                                  {moneda(precio.precio)} / ud.
                                </p>
                              )
                            )}
                            <div className="mx-auto mt-2 flex max-w-44 items-center justify-center gap-2">
                              <p className="line-clamp-2 min-w-0 text-xs leading-4 text-[#71837c]" title={precio.nombreProducto}>
                                {precio.nombreProducto}
                              </p>
                              {precio.urlProducto && (
                                <a
                                  href={precio.urlProducto}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Ver ${precio.nombreProducto} en ${supermercado}`}
                                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#176b50]/25 text-sm font-bold text-[#176b50] transition hover:bg-[#176b50] hover:text-white"
                                >
                                  ↗
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#a8b2ae]" title="Precio no encontrado">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#17352b] text-white">
              <th className="sticky bottom-0 left-0 z-40 w-28 min-w-28 max-w-28 border-r border-t border-white/10 bg-[#17352b] px-3 py-4 shadow-[0_-1px_0_rgba(255,255,255,0.12)] sm:w-56 sm:min-w-56 sm:max-w-56 sm:px-5 sm:py-5">
                <p className="text-base font-extrabold sm:text-lg">Total</p>
                <p className="mt-1 text-[10px] font-medium leading-4 text-white/60 sm:text-xs">Solo se comparan cestas completas</p>
              </th>
              {totalesVisibles.map((total) => {
                const ganadora = total.completa && total.total === totalMasBarato;
                return (
                  <td key={total.supermercado} className={`sticky bottom-0 z-30 border-t border-white/10 px-3 py-4 text-center shadow-[0_-1px_0_rgba(255,255,255,0.12)] sm:px-4 sm:py-5 ${ganadora ? "bg-[#176b50]" : "bg-[#17352b]"}`}>
                    {total.encontrados > 0 ? (
                      <>
                        {ganadora && <span className="mb-2 inline-block rounded-full bg-[#f4c95d] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#17352b]">Más barato</span>}
                        <p className="text-lg font-extrabold sm:text-xl">
                          {total.estimado ? "≈ " : ""}
                          {moneda(total.total)}
                        </p>
                        {total.comparable && (
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/65">
                            Cantidades comparables
                          </p>
                        )}
                        {!total.completa && <p className="mt-1 text-xs font-semibold text-[#f4c95d]">{total.encontrados} de {articulos.length} productos</p>}
                      </>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
