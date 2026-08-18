type OpcionesReintento = {
  intentos?: number;
  retrasoInicialMs?: number;
  esReintentable?: (error: unknown) => boolean;
};

function esperar(milisegundos: number) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export async function ejecutarConReintentos<T>(
  operacion: (intento: number) => Promise<T>,
  {
    intentos = 3,
    retrasoInicialMs = 1_000,
    esReintentable = () => true,
  }: OpcionesReintento = {},
): Promise<T> {
  let ultimoError: unknown;

  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      return await operacion(intento);
    } catch (error) {
      ultimoError = error;
      if (intento === intentos || !esReintentable(error)) throw error;
      await esperar(retrasoInicialMs * 2 ** (intento - 1));
    }
  }

  throw ultimoError;
}
