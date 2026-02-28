"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  LANGUAGE_STORAGE_KEY,
  translate,
  type Language,
} from "@/lib/i18n";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getSnapshot(): Language {
  if (typeof window === "undefined") {
    return "es";
  }

  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

  return savedLanguage === "en" ? "en" : "es";
}

function getServerSnapshot(): Language {
  return "es";
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  function handleStorage(event: StorageEvent) {
    if (event.key && event.key !== LANGUAGE_STORAGE_KEY) {
      return;
    }

    onStoreChange();
  }

  function handleLanguageChange() {
    onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener("sapogames-language-change", handleLanguageChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(
      "sapogames-language-change",
      handleLanguageChange,
    );
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(nextLanguage: Language) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    window.dispatchEvent(new Event("sapogames-language-change"));
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: (key, variables) => translate(language, key, variables),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
}
