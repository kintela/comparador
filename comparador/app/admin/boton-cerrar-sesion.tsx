"use client";

import { useState } from "react";

export function BotonCerrarSesion() {
  const [cerrando, setCerrando] = useState(false);

  async function cerrarSesion() {
    setCerrando(true);
    try {
      await fetch("/api/admin/sesion", { method: "DELETE" });
    } finally {
      window.location.assign("/acceso-admin");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void cerrarSesion()}
      disabled={cerrando}
      className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 shadow-lg transition hover:border-red-400 hover:text-red-300 disabled:opacity-60"
    >
      {cerrando ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
