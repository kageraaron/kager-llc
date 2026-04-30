"use client";

import { useI18n } from '@/src/lib/i18n';

const LanguageSwitcher = () => {
  const { lang, setLanguage } = useI18n();

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' },
    { code: 'fr', label: 'FR' },
    { code: 'de', label: 'DE' },
    { code: 'zh', label: 'ZH' },
    { code: 'ja', label: 'JA' },
  ];

  return (
    <div className="flex items-center gap-2">
      {languages.map((l) => (
        <button
          key={l.code}
          onClick={() => setLanguage(l.code)}
          className={`rounded px-2 py-1 text-xs font-medium ring-1 ring-ink-800 ${
            lang === l.code ? 'bg-accent text-white' : 'text-ink-200'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
