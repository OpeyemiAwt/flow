"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyLocale,
  LOCALE_CHANGE_EVENT,
  LOCALE_META,
  MESSAGES,
  readStoredLocale,
  type FlowLocale,
  type FlowTranslations,
} from "../lib/i18n.ts";

interface LanguageContextValue {
  locale: FlowLocale;
  dir: "ltr" | "rtl";
  setLocale: (next: FlowLocale) => void;
  t: FlowTranslations;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  dir: "ltr",
  setLocale: () => {},
  t: MESSAGES.en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<FlowLocale>("en");

  useEffect(() => {
    const sync = () => {
      const next = readStoredLocale();
      setLocaleState(next);
      const meta = LOCALE_META[next];
      document.documentElement.lang = meta.code;
      document.documentElement.dir = meta.dir;
    };
    sync();
    window.addEventListener(LOCALE_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setLocale = useCallback((next: FlowLocale) => {
    applyLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      dir: LOCALE_META[locale].dir,
      setLocale,
      t: MESSAGES[locale],
    }),
    [locale, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
