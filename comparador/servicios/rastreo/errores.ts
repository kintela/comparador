export function esRespuestaSinResultados(mensaje: string): boolean {
  return (
    /no se pudieron identificar productos/i.test(mensaje) ||
    /no se encontr[oó] una categor[ií]a adecuada/i.test(mensaje) ||
    /no (?:contiene|devolvi[oó]|encontr[oó]).*(?:producto|resultado)/i.test(
      mensaje,
    ) ||
    /respondi[oó] con estado 404/i.test(mensaje)
  );
}
