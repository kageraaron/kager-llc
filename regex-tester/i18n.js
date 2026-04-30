const i18n = {
    translations: {},
    currentLang: 'en',
    
    async init() {
        const savedLang = localStorage.getItem('preferredLang');
        const browserLang = navigator.language.split('-')[0];
        this.currentLang = savedLang || browserLang || 'en';
        
        await this.loadTranslations();
        this.applyTranslations();
        this.updateActiveLanguageUI();
    },
    
    async loadTranslations() {
        try {
            const response = await fetch('translations.json');
            if (!response.ok) throw new Error('Translations file not found');
            const data = await response.json();
            this.translations = data;
        } catch (e) {
            console.error('Failed to load translations', e);
            this.translations = {};
        }
    },
    
    t(key) {
        const langData = this.translations[this.currentLang] || this.translations['en'] || {};
        return langData[key] || key;
    },
    
    applyTranslations() {
        // Standard translation
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.innerHTML = translation;
            }
        });
        
        // Title translation
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
        
        if (this.translations[this.currentLang]?.title) {
            document.title = this.translations[this.currentLang].title;
        }
        
        document.documentElement.lang = this.currentLang;
    },
    
    async setLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('preferredLang', lang);
        this.applyTranslations();
        this.updateActiveLanguageUI();
    },
    
    updateActiveLanguageUI() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === this.currentLang);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => i18n.init());
