import "server-only";

export type CeldaListaCorreo = {
  supermercado: string;
  nombreProducto: string;
  imagenProducto: string | null;
  total: number;
  estimado: boolean;
  detalles: string[];
  urlProducto: string | null;
};

export type FilaListaCorreo = {
  producto: string;
  cantidad: string;
  celdas: Array<CeldaListaCorreo | null>;
};

export type TotalListaCorreo = {
  supermercado: string;
  total: number;
  encontrados: number;
  completa: boolean;
  estimado: boolean;
  ganador: boolean;
};

export type ListaCompraCorreo = {
  supermercados: string[];
  filas: FilaListaCorreo[];
  totales: TotalListaCorreo[];
};

function escaparHtml(valor: string) {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor);
}

function enlaceSeguro(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > 2_048) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function textoLimitado(valor: unknown, maximo: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto.length > 0 && texto.length <= maximo ? texto : null;
}

function numeroValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

export function validarListaCompraCorreo(valor: unknown): ListaCompraCorreo | null {
  if (!valor || typeof valor !== "object") return null;
  const entrada = valor as Record<string, unknown>;
  if (
    !Array.isArray(entrada.supermercados) ||
    entrada.supermercados.length < 1 ||
    entrada.supermercados.length > 20 ||
    !Array.isArray(entrada.filas) ||
    entrada.filas.length < 1 ||
    entrada.filas.length > 50 ||
    !Array.isArray(entrada.totales)
  ) {
    return null;
  }

  const supermercados = entrada.supermercados.map((item) =>
    textoLimitado(item, 80),
  );
  if (supermercados.some((item) => item === null)) return null;
  const nombres = supermercados as string[];

  const filas: FilaListaCorreo[] = [];
  for (const valorFila of entrada.filas) {
    if (!valorFila || typeof valorFila !== "object") return null;
    const fila = valorFila as Record<string, unknown>;
    const producto = textoLimitado(fila.producto, 200);
    const cantidad = textoLimitado(fila.cantidad, 100);
    if (!producto || !cantidad || !Array.isArray(fila.celdas)) return null;
    if (fila.celdas.length !== nombres.length) return null;

    const celdas: Array<CeldaListaCorreo | null> = [];
    for (let indice = 0; indice < fila.celdas.length; indice += 1) {
      const valorCelda = fila.celdas[indice];
      if (valorCelda === null) {
        celdas.push(null);
        continue;
      }
      if (!valorCelda || typeof valorCelda !== "object") return null;
      const celda = valorCelda as Record<string, unknown>;
      const supermercado = textoLimitado(celda.supermercado, 80);
      const nombreProducto = textoLimitado(celda.nombreProducto, 300);
      if (
        supermercado !== nombres[indice] ||
        !nombreProducto ||
        !numeroValido(celda.total) ||
        typeof celda.estimado !== "boolean" ||
        !Array.isArray(celda.detalles) ||
        celda.detalles.length > 6
      ) {
        return null;
      }
      const detalles = celda.detalles.map((item) => textoLimitado(item, 250));
      if (detalles.some((item) => item === null)) return null;
      const urlProducto =
        celda.urlProducto === null ? null : enlaceSeguro(celda.urlProducto);
      if (celda.urlProducto !== null && !urlProducto) return null;
      const imagenProducto =
        celda.imagenProducto == null
          ? null
          : enlaceSeguro(celda.imagenProducto);
      if (celda.imagenProducto != null && !imagenProducto) return null;
      celdas.push({
        supermercado,
        nombreProducto,
        imagenProducto,
        total: celda.total,
        estimado: celda.estimado,
        detalles: detalles as string[],
        urlProducto,
      });
    }
    filas.push({ producto, cantidad, celdas });
  }

  if (entrada.totales.length !== nombres.length) return null;
  const totales: TotalListaCorreo[] = [];
  for (let indice = 0; indice < entrada.totales.length; indice += 1) {
    const valorTotal = entrada.totales[indice];
    if (!valorTotal || typeof valorTotal !== "object") return null;
    const total = valorTotal as Record<string, unknown>;
    const supermercado = textoLimitado(total.supermercado, 80);
    if (
      supermercado !== nombres[indice] ||
      !numeroValido(total.total) ||
      !Number.isInteger(total.encontrados) ||
      (total.encontrados as number) < 0 ||
      typeof total.completa !== "boolean" ||
      typeof total.estimado !== "boolean" ||
      typeof total.ganador !== "boolean"
    ) {
      return null;
    }
    totales.push({
      supermercado,
      total: total.total,
      encontrados: total.encontrados as number,
      completa: total.completa,
      estimado: total.estimado,
      ganador: total.ganador,
    });
  }

  return { supermercados: nombres, filas, totales };
}

export function crearCorreoListaCompra(lista: ListaCompraCorreo) {
  const cabeceras = lista.supermercados
    .map(
      (supermercado) =>
        `<th style="padding:12px;border:1px solid #dfe5e2;background:#f7f5ee;text-align:center">${escaparHtml(supermercado)}</th>`,
    )
    .join("");
  const filas = lista.filas
    .map((fila) => {
      const celdas = fila.celdas
        .map((celda) => {
          if (!celda) {
            return '<td style="padding:14px;border:1px solid #dfe5e2;text-align:center;color:#8c9a95">—</td>';
          }
          const detalles = celda.detalles
            .map(
              (detalle) =>
                `<div style="margin-top:4px;color:#71837c;font-size:12px">${escaparHtml(detalle)}</div>`,
            )
            .join("");
          const nombre = celda.urlProducto
            ? `<a href="${escaparHtml(celda.urlProducto)}" style="color:#176b50;text-decoration:underline">${escaparHtml(celda.nombreProducto)}</a>`
            : escaparHtml(celda.nombreProducto);
          const imagen = celda.imagenProducto
            ? `${celda.urlProducto ? `<a href="${escaparHtml(celda.urlProducto)}" style="display:inline-block;text-decoration:none">` : ""}<img src="${escaparHtml(celda.imagenProducto)}" alt="${escaparHtml(celda.nombreProducto)}" width="80" height="80" style="display:block;width:80px;height:80px;margin:0 auto 10px;border:0;border-radius:10px;background:#f7f5ee;object-fit:contain" />${celda.urlProducto ? "</a>" : ""}`
            : "";
          return `<td style="min-width:150px;padding:14px;border:1px solid #dfe5e2;text-align:center;vertical-align:top">
            ${imagen}
            <strong style="display:block;color:#176b50;font-size:17px">${celda.estimado ? "≈ " : ""}${moneda(celda.total)}</strong>
            ${detalles}
            <div style="margin-top:8px;color:#445951;font-size:12px;line-height:1.4">${nombre}</div>
          </td>`;
        })
        .join("");
      return `<tr>
        <th style="min-width:150px;padding:14px;border:1px solid #dfe5e2;text-align:left;vertical-align:top;background:#fff">
          <strong>${escaparHtml(fila.producto)}</strong>
          <div style="margin-top:5px;color:#71837c;font-size:12px">${escaparHtml(fila.cantidad)}</div>
        </th>${celdas}
      </tr>`;
    })
    .join("");
  const totales = lista.totales
    .map((total) => {
      const contenido =
        total.encontrados === 0
          ? "—"
          : `${total.estimado ? "≈ " : ""}${moneda(total.total)}${
              total.completa
                ? ""
                : `<div style="margin-top:4px;color:#f4c95d;font-size:11px">${total.encontrados} de ${lista.filas.length} productos</div>`
            }`;
      return `<td style="padding:14px;border:1px solid #315047;background:${total.ganador ? "#176b50" : "#17352b"};color:#fff;text-align:center;font-size:18px;font-weight:800">
        ${total.ganador ? '<div style="margin-bottom:6px;color:#f4c95d;font-size:10px;text-transform:uppercase">Más barato</div>' : ""}${contenido}
      </td>`;
    })
    .join("");

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f5ee;color:#17352b;font-family:Arial,sans-serif">
    <div style="padding:28px 16px">
      <div style="max-width:1100px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
        <div style="padding:24px;background:#17352b;color:#fff">
          <div style="color:#77d5b7;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px">Comparador de precios</div>
          <h1 style="margin:8px 0 0;font-size:26px">Lista de la compra</h1>
          <p style="margin:8px 0 0;color:#c8d5d0;font-size:14px">Comparación personalizada con los supermercados visibles en el momento del envío.</p>
        </div>
        <div style="overflow-x:auto">
          <table role="presentation" style="width:100%;border-collapse:collapse">
            <thead><tr><th style="padding:12px;border:1px solid #dfe5e2;background:#f7f5ee;text-align:left">Producto</th>${cabeceras}</tr></thead>
            <tbody>${filas}</tbody>
            <tfoot><tr><th style="padding:14px;border:1px solid #315047;background:#17352b;color:#fff;text-align:left;font-size:18px">Total</th>${totales}</tr></tfoot>
          </table>
        </div>
        <div style="padding:20px 24px;text-align:center">
          <p style="margin:0 0 14px;color:#71837c;font-size:12px;line-height:1.5">Los precios proceden de los últimos datos disponibles y pueden variar en tienda.</p>
          <a href="https://comparador.kintela.es" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#176b50;color:#fff;font-size:14px;font-weight:bold;text-decoration:none">Abrir Comparador de precios</a>
        </div>
      </div>
    </div>
  </body></html>`;

  const texto = [
    "LISTA DE LA COMPRA",
    "",
    ...lista.filas.flatMap((fila) => [
      `${fila.producto} — ${fila.cantidad}`,
      ...fila.celdas.map((celda, indice) =>
        celda
          ? `  ${lista.supermercados[indice]}: ${celda.estimado ? "≈ " : ""}${moneda(celda.total)} — ${celda.nombreProducto}`
          : `  ${lista.supermercados[indice]}: no disponible`,
      ),
      "",
    ]),
    "TOTALES",
    ...lista.totales.map((total) =>
      total.encontrados === 0
        ? `${total.supermercado}: no disponible`
        : `${total.supermercado}: ${total.estimado ? "≈ " : ""}${moneda(total.total)}${total.completa ? "" : ` (${total.encontrados} de ${lista.filas.length} productos)`}`,
    ),
    "",
    "Los precios pueden variar en tienda.",
    "Consulta el comparador: https://comparador.kintela.es",
  ].join("\n");

  return { html, texto };
}
