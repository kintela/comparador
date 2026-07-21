import type { Metadata } from "next";
import Link from "next/link";

import { CalculadoraLista } from "./calculadora-lista";

export const metadata: Metadata = {
  title: "Lista de la compra | Comparador",
  description:
    "Compara el precio total de tu lista de la compra entre supermercados.",
};

export default function ListaCompraPage() {
  return (
    <main className="min-h-screen bg-[#f7f5ee] text-[#17352b]">
      <header className="border-b border-[#17352b]/10 bg-[#f7f5ee]/90 px-5 py-5 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Inicio">
            <span className="grid size-10 place-items-center rounded-xl bg-[#176b50] text-xl text-white">
              €
            </span>
            <span className="text-xl font-bold tracking-tight">Comparador</span>
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-[#176b50]/20 bg-white px-4 py-2 text-sm font-bold text-[#176b50] transition hover:border-[#176b50]/40 hover:bg-[#e7f5ee]"
          >
            Buscar productos
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 py-12 sm:px-8 sm:py-16">
        <div className="pointer-events-none absolute -right-28 top-10 size-80 rounded-full bg-[#f4c95d]/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-36 bottom-0 size-72 rounded-full bg-[#54b892]/12 blur-3xl" />

        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#16805e]">
              Tu cesta, supermercado a supermercado
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">
              Calcula tu lista de la compra
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[#60766e]">
              Añade los productos como los escribirías normalmente. Compararemos
              la opción más barata encontrada para cada uno y calcularemos el
              total en cada supermercado.
            </p>
          </div>

          <CalculadoraLista />
        </div>
      </section>

      <footer className="border-t border-[#17352b]/10 px-5 py-8 text-center text-sm text-[#71837c]">
        Los precios pueden variar según la tienda, el formato del producto y la
        zona de entrega.
      </footer>
    </main>
  );
}
