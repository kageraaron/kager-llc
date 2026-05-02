"use client";

import { useState, useEffect, createContext, useContext } from 'react';

type Translations = Record<string, Record<string, string>>;

const I18nContext = createContext<{
  t: (key: string) => string;
  lang: string;
  setLanguage: (lang: string) => void;
} | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState('en');
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    const savedLang = localStorage.getItem('preferredLang');
    const browserLang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
    const initialLang = savedLang || browserLang || 'en';
    setLang(initialLang);

    console.debug('[i18n] initialLang=', initialLang);
    fetch('/translations.json')
      .then((res) => res.json())
      .then((data) => {
        console.debug('[i18n] loaded translations', Object.keys(data || {}));
        setTranslations(data);
      })
      .catch((err) => console.error('Failed to load translations', err));
  }, []);

  const t = (key: string) => {
    const langData = translations[lang] || translations['en'] || {};
    return langData[key] || key;
  };

  const setLanguage = (newLang: string) => {
    console.debug('[i18n] setLanguage ->', newLang);
    setLang(newLang);
    localStorage.setItem('preferredLang', newLang);
  };

  return (
    <I18nContext.Provider value={{ t, lang, setLanguage }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
