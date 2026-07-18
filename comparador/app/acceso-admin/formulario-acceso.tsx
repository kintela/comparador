"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function FormularioAccesoAdmin() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceder(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCargando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/admin/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      const resultado = (await respuesta.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!respuesta.ok || !resultado.ok) {
        throw new Error(resultado.error ?? "No se pudo iniciar sesión");
      }

      setClave("");
      router.replace("/admin");
      router.refresh();
    } catch (problema) {
      setError(
        problema instanceof Error ? problema.message : "No se pudo iniciar sesión",
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <form
      onSubmit={acceder}
      className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
    >
      <label className="block text-sm font-medium text-slate-300">
        Clave de administración
        <input
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
        />
      </label>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={cargando}
        className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
      >
        {cargando ? "Comprobando…" : "Acceder"}
      </button>
    </form>
  );
}
