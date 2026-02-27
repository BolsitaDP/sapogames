import Link from "next/link";

import { gameCards } from "@/lib/games";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-[32px] border border-white/8 bg-black/30 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur md:p-8">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-stone-500">
              Sapo Games
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-stone-100 sm:text-4xl">
              Menu
            </h1>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-stone-400">
            Arcade
          </span>
        </header>

        <section className="mt-8 grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gameCards.map((game) => {
            const isLive = game.status === "live";

            return (
              <article
                key={game.slug}
                className="group flex min-h-56 flex-col justify-between rounded-[28px] border border-white/8 bg-white/[0.02] p-5"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-[0.28em] text-stone-500">
                      {game.eyebrow}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${
                        isLive
                          ? "border border-emerald-400/15 bg-emerald-300/10 text-emerald-200"
                          : "border border-white/8 bg-white/[0.03] text-stone-500"
                      }`}
                    >
                      {isLive ? "Listo" : "Pronto"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-stone-100">
                      {game.title}
                    </h2>
                    <p className="max-w-sm text-sm leading-6 text-stone-400">
                      {game.description}
                    </p>
                  </div>
                </div>

                {isLive ? (
                  <Link
                    className="mt-6 inline-flex w-fit rounded-full border border-white/10 bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:border-white hover:bg-stone-100"
                    href={game.href}
                  >
                    Abrir
                  </Link>
                ) : (
                  <span className="mt-6 inline-flex w-fit rounded-full border border-white/8 px-4 py-2.5 text-sm text-stone-500">
                    Bloqueado
                  </span>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
