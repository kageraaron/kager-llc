'use client';

import { useI18n } from '@/lib/i18n';

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
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {languages.map((l) => (
        <button
          key={l.code}
          onClick={() => setLanguage(l.code)}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: lang === l.code ? 'var(--primary)' : 'transparent',
            color: lang === l.code ? 'white' : 'var(--text)',
            cursor: 'pointer',
            fontWeight: lang === l.code ? 'bold' : 'normal',
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
