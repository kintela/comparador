import Link from "next/link";

import { BuscadorProductos } from "./buscador-productos";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f5ee] text-[#17352b]">
      <header className="border-b border-[#17352b]/10 bg-[#f7f5ee]/90 px-5 py-5 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Inicio">
            <span className="grid size-10 place-items-center rounded-xl bg-[#176b50] text-xl text-white">
              €
            </span>
            <span className="text-xl font-bold tracking-tight">Comparador</span>
          </Link>
          <span className="hidden text-sm font-medium text-[#60766e] sm:block">
            Precios claros para comprar mejor
          </span>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
        <div className="pointer-events-none absolute -right-28 top-10 size-80 rounded-full bg-[#f4c95d]/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-36 bottom-0 size-72 rounded-full bg-[#54b892]/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-[#16805e]">
              Compara antes de comprar
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-6xl">
              Encuentra el mejor precio para tu compra
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#60766e]">
              Supermercados{" "}
              <span className="group relative inline-flex">
                <button
                  type="button"
                  className="cursor-help font-bold text-[#16805e] underline decoration-dotted underline-offset-4"
                  aria-describedby="supermercados-rastreados"
                >
                  rastreados
                </button>
                <span
                  id="supermercados-rastreados"
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-20 mt-3 w-max max-w-[calc(100vw-2.5rem)] -translate-x-1/2 rounded-xl bg-[#17352b] px-4 py-3 text-left text-sm font-medium leading-6 text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Alcampo · ALDI · BM Supermercados · DIA · Eroski · Lidl ·
                  Lupa · Mercadona
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-[#17352b]" />
                </span>
              </span>
            </p>
          </div>

          <BuscadorProductos />
        </div>
      </section>

      <footer className="border-t border-[#17352b]/10 px-5 py-8 text-center text-sm text-[#71837c]">
        Los precios pueden variar según la tienda y la zona de entrega.
      </footer>
    </main>
  );
}
