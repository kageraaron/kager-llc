"use client";

import { useI18n } from "@/lib/i18n";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "zh", label: "ZH" },
  { code: "ja", label: "JA" },
];

export function LanguageSwitcher() {
  const { lang, setLanguage } = useI18n();

  return (
    <div className="language-switcher" aria-label="Language">
      {LANGUAGES.map((item) => (
        <button
          className={lang === item.code ? "language-button is-active" : "language-button"}
          key={item.code}
          onClick={() => setLanguage(item.code)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
