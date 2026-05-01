"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Translations = Record<string, Record<string, string>>;

const I18nContext = createContext<{
  t: (key: string, params?: Record<string, string | number>) => string;
  lang: string;
  setLanguage: (lang: string) => void;
} | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState("en");
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    const initialLang =
      localStorage.getItem("preferredLang") ||
      navigator.language.split("-")[0] ||
      "en";

    if (initialLang !== "en") {
      window.setTimeout(() => setLang(initialLang), 0);
    }

    fetch("/translations.json")
      .then((res) => res.json())
      .then((data) => setTranslations(data))
      .catch((err) => console.error("Failed to load translations", err));
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLanguage: (newLang: string) => {
        setLang(newLang);
        localStorage.setItem("preferredLang", newLang);
      },
      t: (key: string, params: Record<string, string | number> = {}) => {
        const langData = translations[lang] || translations.en || {};
        const template = langData[key] || translations.en?.[key] || key;
        return Object.entries(params).reduce(
          (text, [name, value]) =>
            text.replaceAll(`{${name}}`, String(value)),
          template,
        );
      },
    }),
    [lang, translations],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
