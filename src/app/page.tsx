import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { gameCards } from "@/lib/games";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#020202] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="glass-shell mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col rounded-[32px] p-5 md:p-8">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-stone-500">
              Sapo Games
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-stone-100 sm:text-4xl">
              Menu
            </h1>
          </div>

          <Button
            aria-label="Buscar juegos"
            className="shrink-0"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Search className="size-4" />
          </Button>
        </header>

        <section className="mt-8 grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          {gameCards.map((game) => {
            const isLive = game.status === "live";

            const content = (
              <Card className="group h-full min-h-44 overflow-hidden transition hover:border-white/16 hover:bg-white/[0.05]">
                <CardContent className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-4xl text-stone-700 transition group-hover:text-stone-400">
                      {isLive ? "01" : "--"}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.24em] text-stone-600">
                      {isLive ? "Live" : "Soon"}
                    </span>
                  </div>

                  <div className="mt-10 px-1 py-1">
                    <h2
                      className={`text-xl font-medium leading-tight sm:text-2xl ${
                        isLive ? "text-stone-100" : "text-stone-500"
                      }`}
                    >
                      {game.title}
                    </h2>
                  </div>
                </CardContent>
              </Card>
            );

            return isLive ? (
              <Link
                key={game.slug}
                className="block h-full rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                href={game.href}
              >
                {content}
              </Link>
            ) : (
              <div key={game.slug} className="h-full">
                {content}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
