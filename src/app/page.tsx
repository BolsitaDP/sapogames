import Link from "next/link";

import { gameCards } from "@/lib/games";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(184,255,106,0.18),_transparent_30%),linear-gradient(180deg,_#06130f_0%,_#091c16_48%,_#03110d_100%)] px-4 py-6 text-stone-50 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr] lg:items-end">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.34em] text-lime-200/80">
                Sapo Games
              </p>
              <div className="space-y-4">
                <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-none sm:text-6xl lg:text-7xl">
                  Un mini arcade para jugar con amigos desde el celular.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  El objetivo no es montar una app pesada: creas la sala,
                  compartes el link y juegan sin registro. La base ya queda
                  preparada para ir sumando juegos ultra basicos con el mismo
                  flujo.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  className="rounded-full bg-lime-300 px-5 py-3 text-sm font-semibold text-[#072117] transition hover:bg-lime-200"
                  href="/games/rps/"
                >
                  Jugar ahora
                </Link>
                <a
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:border-orange-300 hover:text-orange-100"
                  href="#catalogo"
                >
                  Ver menu
                </a>
              </div>
            </div>

            <div className="grid gap-3 rounded-[30px] border border-white/10 bg-black/20 p-4">
              <div className="rounded-[24px] border border-lime-200/10 bg-lime-300/10 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-lime-100/75">
                  Experiencia
                </p>
                <p className="mt-2 text-lg font-semibold">
                  Primero movil, rapido y sin friccion.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Front
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-200">
                    Next.js exportado a estatico para GitHub Pages.
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Backend
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-200">
                    Supabase con RPC para resolver jugadas y realtime para salas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="catalogo" className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-orange-200/80">
                Catalogo inicial
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">
                Elige un juego.
              </h2>
            </div>
            <p className="max-w-md text-right text-sm leading-6 text-stone-400">
              El menu es el punto de entrada para los juegos actuales y los que
              vayas agregando despues.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {gameCards.map((game) => {
              const isLive = game.status === "live";

              return (
                <article
                  key={game.slug}
                  className="flex h-full flex-col justify-between rounded-[30px] border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-lime-200/70">
                        {game.eyebrow}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${
                          isLive
                            ? "border border-lime-200/15 bg-lime-300/10 text-lime-100"
                            : "border border-white/10 bg-white/5 text-stone-400"
                        }`}
                      >
                        {isLive ? "Activo" : "En cola"}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold text-stone-50">
                        {game.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-stone-300">
                        {game.description}
                      </p>
                    </div>
                  </div>

                  {isLive ? (
                    <Link
                      className="mt-6 inline-flex w-fit rounded-full bg-stone-50 px-4 py-3 text-sm font-semibold text-[#072117] transition hover:bg-lime-200"
                      href={game.href}
                    >
                      Abrir juego
                    </Link>
                  ) : (
                    <span className="mt-6 inline-flex w-fit rounded-full border border-white/12 px-4 py-3 text-sm text-stone-400">
                      Disponible mas adelante
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
