export function esDireccionCorreoValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const correo = valor.trim();
  if (correo.length < 6 || correo.length > 254) return false;

  const separador = correo.indexOf("@");
  if (separador < 1 || separador !== correo.lastIndexOf("@")) return false;
  const local = correo.slice(0, separador);
  const dominio = correo.slice(separador + 1).toLocaleLowerCase("en");
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
  ) {
    return false;
  }

  const etiquetas = dominio.split(".");
  if (etiquetas.length < 2) return false;
  if (
    etiquetas.some(
      (etiqueta) =>
        etiqueta.length < 1 ||
        etiqueta.length > 63 ||
        etiqueta.startsWith("-") ||
        etiqueta.endsWith("-") ||
        !/^[a-z0-9-]+$/i.test(etiqueta),
    )
  ) {
    return false;
  }

  const extension = etiquetas.at(-1) ?? "";
  return (
    /^[a-z]{2,63}$/i.test(extension) ||
    /^xn--[a-z0-9-]{2,59}$/i.test(extension)
  );
}
