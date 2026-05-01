'use client';

import enTranslations from './translations/en.json';

/**
 * Simple i18n manager for shared utilities.
 */
export class I18nManager {
  constructor(translations = { en: enTranslations }) {
    this.translations = translations;
    this.lang = 'en';
  }

  setLanguage(lang) {
    this.lang = lang;
  }

  t(key, params = {}) {
    const langData = this.translations[this.lang] || this.translations['en'] || {};
    let text = langData[key] || key;
    
    Object.keys(params).forEach(p => {
      text = text.replace(`{${p}}`, params[p]);
    });
    
    return text;
  }
}

export const sharedI18n = new I18nManager();
