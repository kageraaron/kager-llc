import React, { useState, useEffect, createContext, useContext } from 'react';

type Translations = Record<string, Record<string, string>>;

interface I18nContextType {
  t: (key: string) => string;
  lang: string;
  setLanguage: (lang: string) => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState('en');
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    const savedLang = localStorage.getItem('preferredLang');
    const browserLang = navigator.language.split('-')[0];
    const initialLang = savedLang || browserLang || 'en';
    setLang(initialLang);

    fetch('/translations.json')
      .then((res) => res.json())
      .then((data) => setTranslations(data))
      .catch((err) => console.error('Failed to load translations', err));
  }, []);

  const t = (key: string) => {
    const langData = translations[lang] || translations['en'] || {};
    return langData[key] || key;
  };

  const setLanguage = (newLang: string) => {
    setLang(newLang);
    localStorage.setItem('preferredLang', newLang);
  };

  return (
    <I18nContext.Provider value={{ t, lang, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
};
