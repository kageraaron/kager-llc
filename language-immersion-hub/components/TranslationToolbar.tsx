'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { ChevronDown, Globe } from 'lucide-react';

const SUPPORTED_LANGS = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
];

export default function TranslationToolbar() {
  const { lang, setLanguage } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = SUPPORTED_LANGS.find(l => l.code === lang) || SUPPORTED_LANGS[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-xl hover:border-blue-600 transition-all shadow-sm"
      >
        <span className="text-lg">{currentLang.flag}</span>
        <span className="text-xs font-black text-gray-900 hidden sm:inline">{currentLang.code.toUpperCase()}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[100] py-2 animate-in fade-in zoom-in duration-200">
          <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1">
            Select Language
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-blue-50 ${
                  lang === l.code ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600'
                }`}
              >
                <span className="text-xl">{l.flag}</span>
                <div className="flex flex-col items-start">
                  <span className="text-xs">{l.label}</span>
                </div>
                {lang === l.code && (
                  <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
