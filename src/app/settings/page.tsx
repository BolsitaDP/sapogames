"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

const LANGUAGE_STORAGE_KEY = "sapogames:language";

const languages = [
  { label: "Espanol", value: "es" },
  { label: "English", value: "en" },
] as const;

export default function SettingsPage() {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") {
      return "es";
    }

    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? "es";
  });

  function handleLanguageChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="glass-shell mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col rounded-[32px] p-5 md:p-8">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-stone-300 transition hover:border-white/20 hover:text-stone-100"
            href="/"
          >
            <ChevronLeft className="size-4" />
            Volver
          </Link>

          <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-100 sm:text-3xl">
            Configuracion
          </h1>
        </header>

        <section className="glass-panel mt-8 rounded-[28px] p-5 sm:p-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">
                Idioma
              </p>
              <h2 className="text-xl font-medium text-stone-100">
                Seleccion de idioma
              </h2>
            </div>

            <label className="block">
              <select
                className="glass-tile w-full rounded-2xl px-4 py-3 text-base text-stone-100 outline-none transition focus:border-white/20"
                onChange={handleLanguageChange}
                value={language}
              >
                {languages.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}
