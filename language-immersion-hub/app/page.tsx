'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Info, ExternalLink, ChevronRight, Check } from 'lucide-react';

const RESOURCES = [
  // SPANISH
  { id: 1, lang: 'spanish', level: 'A1', type: 'TV Series', title: 'Extra Spanish', desc: "A sitcom designed for learners. Simple vocabulary and slow, clear speech.", link: 'https://lingopie.com' },
  { id: 2, lang: 'spanish', level: 'A1', type: 'Cartoon', title: 'Pocoyó', desc: "Extremely simple language and visual context. Perfect for first steps.", link: '#' },
  { id: 3, lang: 'spanish', level: 'A2', type: 'Book', title: 'Pepa Villa, taxista', desc: "Graded reader following a taxi driver in Barcelona. Daily life vocabulary.", link: '#' },
  { id: 4, lang: 'spanish', level: 'A2', type: 'Book', title: 'Manolito Gafotas', desc: "Humorous adventures of a boy in Madrid. Linguistically accessible.", link: '#' },
  { id: 5, lang: 'spanish', level: 'B1', type: 'TV Series', title: 'La Reina del Sur', desc: "High-stakes drama. Repetitive dialogue perfect for intermediate learners.", link: 'https://lingopie.com' },
  { id: 6, lang: 'spanish', level: 'B1', type: 'Book', title: 'El Alquimista', desc: "Coelho's classic in Spanish. Simple, repetitive, impactful vocabulary.", link: '#' },
  { id: 7, lang: 'spanish', level: 'B2', type: 'Movie', title: 'El Laberinto del Fauno', desc: "Dark fantasy with clear diction. Rich, descriptive Spanish.", link: '#' },
  { id: 8, lang: 'spanish', level: 'B2', type: 'TV Series', title: 'La Casa de Papel', desc: "Global phenomenon. Fast dialogue, high context and intensity.", link: 'https://lingopie.com' },
  { id: 9, lang: 'spanish', level: 'C1', type: 'Movie', title: 'Relatos Salvajes', desc: "Fast-paced anthology film with various accents and colloquialisms.", link: '#' },
  { id: 10, lang: 'spanish', level: 'C1', type: 'Movie', title: 'Roma', desc: "Alfonso Cuarón's masterpiece. Intimate dialogue and cultural nuances.", link: '#' },
  // FRENCH
  { id: 11, lang: 'french', level: 'A1', type: 'Movie', title: 'Kirikou et la Sorcière', desc: "Animated fable with exceptionally clear articulation.", link: '#' },
  { id: 12, lang: 'french', level: 'A1', type: 'TV Series', title: 'Extra French', desc: "Sitcom tailored for beginners. Repetitive and slow delivery.", link: '#' },
  { id: 13, lang: 'french', level: 'A2', type: 'Book', title: 'Le Petit Prince', desc: "Classic philosophical tale. Simple grammar, profound vocabulary.", link: '#' },
  { id: 14, lang: 'french', level: 'A2', type: 'Book', title: 'Le Petit Nicolas', desc: "Humorous stories from a child's perspective. Clear grammar.", link: '#' },
  { id: 15, lang: 'french', level: 'B1', type: 'Book', title: "L'Étranger", desc: "Camus' masterpiece. Uses direct, simple syntax (passé composé).", link: '#' },
  { id: 16, lang: 'french', level: 'B1', type: 'Movie', title: 'Intouchables', desc: "Heartwarming comedy. Contemporary French with accessible slang.", link: 'https://lingopie.com' },
  { id: 17, lang: 'french', level: 'B2', type: 'Movie', title: 'Amélie', desc: "Visually descriptive. Fast narration for excellent practice.", link: 'https://lingopie.com' },
  { id: 18, lang: 'french', level: 'B2', type: 'TV Series', title: 'Lupin', desc: "Modern thriller. Fast-paced action helps contextualize dialogue.", link: 'https://lingopie.com' },
  { id: 19, lang: 'french', level: 'C1', type: 'Movie', title: 'La Haine', desc: "Raw and intense. High usage of Verlan and street slang.", link: '#' },
  { id: 20, lang: 'french', level: 'C1', type: 'Book', title: 'Bonjour Tristesse', desc: "Elegant prose. Sophisticated emotional and descriptive vocabulary.", link: '#' },
  // GERMAN
  { id: 21, lang: 'german', level: 'A1', type: 'Web Series', title: 'Nicos Weg', desc: "Gold standard immersion. Follows Nico from zero to B1.", link: '#' },
  { id: 22, lang: 'german', level: 'A1', type: 'TV Series', title: 'Sendung mit der Maus', desc: "Educational show with clear German and strong visuals.", link: '#' },
  { id: 23, lang: 'german', level: 'A2', type: 'Book', title: 'Dino lernt Deutsch', desc: "Entertaining short stories for adults. Natural vocabulary.", link: '#' },
  { id: 24, lang: 'german', level: 'A2', type: 'Book', title: 'Café in Berlin', desc: "Modern short stories for lower-intermediate learners.", link: '#' },
  { id: 25, lang: 'german', level: 'B1', type: 'Book', title: 'Tschick', desc: "Modern road trip novel. Colloquial but standard German.", link: '#' },
  { id: 26, lang: 'german', level: 'B1', type: 'Movie', title: 'Lola rennt', desc: "High-energy thriller. Repetitive loops help comprehension.", link: '#' },
  { id: 27, lang: 'german', level: 'B2', type: 'Movie', title: 'Good Bye, Lenin!', desc: "Standard Hochdeutsch with fascinating historical context.", link: '#' },
  { id: 28, lang: 'german', level: 'B2', type: 'TV Series', title: 'Dark', desc: "Complex sci-fi. Clear Hochdeutsch delivery. Massive boost.", link: '#' },
  { id: 29, lang: 'german', level: 'C1', type: 'Movie', title: 'Der Untergang', desc: "Military/political vocabulary. Varied regional accents.", link: '#' },
  { id: 30, lang: 'german', level: 'C1', type: 'Book', title: 'Die Verwandlung', desc: "Surreal Kafka masterpiece. Complex syntax and depth.", link: '#' },
];

const LEVELS = ['all', 'A1', 'A2', 'B1', 'B2', 'C1'];
const LANGS = ['all', 'spanish', 'french', 'german', 'japanese', 'italian', 'portuguese', 'chinese', 'russian'];

export default function Home() {
  const { t } = useI18n();
  const [activeLang, setActiveLang] = useState('all');
  const [activeLevel, setActiveLevel] = useState('all');

  const filtered = RESOURCES.filter(r => 
    (activeLang === 'all' || r.lang === activeLang) && 
    (activeLevel === 'all' || r.level === activeLevel)
  );

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-white border-b border-gray-200 py-20 px-4 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-50/50 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto relative">
          <h1 className="text-5xl md:text-7xl font-black text-gray-900 mb-6 tracking-tight">
            {t('hero_title')}
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            {t('hero_sub')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#resources" className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
              {t('browse_btn')} <ChevronRight size={20} />
            </a>
            <a href="#tools" className="px-8 py-4 bg-white text-gray-900 font-bold rounded-xl border border-gray-200 hover:border-blue-600 transition-all">
              {t('tools_btn')}
            </a>
          </div>
        </div>
      </section>

      {/* Calibration Guide */}
      <section className="py-24 px-4 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">{t('calibration_title')}</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">{t('calibration_sub')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { cat: 'A — Basic User', levels: [
              { code: 'A1', name: 'Breakthrough', desc: 'Basic phrases & introduction.' },
              { code: 'A2', name: 'Waystage', desc: 'Everyday vocabulary & simple tasks.' }
            ], border: 'border-green-500' },
            { cat: 'B — Independent User', levels: [
              { code: 'B1', name: 'Threshold', desc: 'Situational travel & simple texts.' },
              { code: 'B2', name: 'Vantage', desc: 'Complex ideas & fluent interaction.' }
            ], border: 'border-orange-500' },
            { cat: 'C — Proficient User', levels: [
              { code: 'C1', name: 'Operational', desc: 'Spontaneous fluency & professional use.' },
              { code: 'C2', name: 'Mastery', desc: 'Full precision & complex arguments.' }
            ], border: 'border-red-500' }
          ].map((c, i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-2 border-b-2 border-gray-100 pb-2">{c.cat}</div>
              {c.levels.map((l, j) => (
                <div key={j} className={`bg-white p-6 rounded-2xl border-l-4 ${c.border} shadow-sm hover:shadow-md transition-all group`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl font-black text-gray-900">{l.code}</span>
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-tighter">{l.name}</span>
                  </div>
                  <p className="text-sm text-gray-500 leading-tight">{l.desc}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Library Section */}
      <section id="resources" className="py-24 bg-white border-y border-gray-200 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
            <div>
              <h2 className="text-4xl font-extrabold text-gray-900 mb-4">{t('library_title')}</h2>
              <p className="text-gray-500">{t('library_sub')}</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-6 bg-gray-50 p-6 rounded-2xl border border-gray-200">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Language</label>
                <select 
                  className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-600 transition-all"
                  value={activeLang}
                  onChange={(e) => setActiveLang(e.target.value)}
                >
                  {LANGS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 mb-2 group">
                  CEFR Level
                  <div className="relative cursor-help">
                    <Info size={12} className="text-blue-500" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white p-4 rounded-xl text-[10px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-2xl z-50">
                      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2">
                        <span className="font-black text-green-400">A1</span> <span>Basic phrases & familiar topics</span>
                        <span className="font-black text-green-400">A2</span> <span>Simple tasks & background</span>
                        <span className="font-black text-orange-400">B1</span> <span>Travel situations & simple texts</span>
                        <span className="font-black text-orange-400">B2</span> <span>Complex ideas & fluency</span>
                        <span className="font-black text-red-400">C1</span> <span>Social & professional mastery</span>
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-top-gray-900" />
                    </div>
                  </div>
                </label>
                <div className="flex gap-2">
                  {LEVELS.map(lv => (
                    <button 
                      key={lv} 
                      onClick={() => setActiveLevel(lv)}
                      className={`px-3 py-2 rounded-lg text-xs font-black transition-all ${
                        activeLevel === lv ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-400 hover:border-blue-600'
                      }`}
                    >
                      {lv.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map(r => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{r.type}</span>
                  <span className={`px-2 py-1 rounded text-[10px] font-black ${
                    r.level.startsWith('A') ? 'bg-green-50 text-green-600' :
                    r.level.startsWith('B') ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {r.level}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{r.title}</h3>
                <p className="text-sm text-gray-500 mb-6 flex-grow leading-snug">{r.desc}</p>
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{r.lang}</span>
                  <a href={r.link} className="text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 text-xs font-bold">
                    Explore <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEO Content Blocks: "Best [Product] for [Niche]" */}
      <section className="py-24 bg-gray-50 px-4 border-b border-gray-200">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-12 text-center">Language Learning Guides</h2>
          
          <div className="space-y-12">
            <article className="bg-white p-8 rounded-3xl shadow-sm border border-gray-200">
              <h3 className="text-2xl font-bold mb-4">Best Movies to Learn Spanish for B1 Intermediate Learners</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Reaching the B1 level is a major milestone in language learning. At this stage, you need content that challenges your listening comprehension without overwhelming you with archaic grammar. <strong>"El Alquimista"</strong> and <strong>"La Reina del Sur"</strong> are top choices because they utilize standard Latin American and European Spanish with clear articulation. For those interested in cultural depth, <strong>"El Laberinto del Fauno"</strong> provides a rich vocabulary set while maintaining a deliberate pace of dialogue.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-xl">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">01</div>
                  <span className="text-sm font-bold text-blue-900 text-sm">Focus on Standard Dialects</span>
                </div>
                <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-xl">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">02</div>
                  <span className="text-sm font-bold text-blue-900 text-sm">Use Spanish Subtitles ONLY</span>
                </div>
              </div>
            </article>

            <article className="bg-white p-8 rounded-3xl shadow-sm border border-gray-200">
              <h3 className="text-2xl font-bold mb-4">Best Immersion Books for French A2 Beginners</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                French beginners often struggle with the transition from textbooks to native literature. The secret is to start with <strong>"Le Petit Prince"</strong> or <strong>"Le Petit Nicolas"</strong>. These books use the *passé composé* rather than the more complex *passé simple*, making them perfect for A2 learners who are just getting used to past tense narratives. Combining these readings with tools like <strong>Lingopie</strong> allows you to see the grammar in action within visual contexts.
              </p>
              <div className="flex gap-4">
                <a href="https://lingopie.com" className="px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all">Try French Immersion on Lingopie</a>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section id="tools" className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">{t('fluency_stack')}</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">{t('fluency_sub')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { title: 'Lingopie', icon: '🎬', desc: 'The "Netflix of Language Learning." Interactive subtitles, instant flashcards, and native content.', features: ['Real movies & TV shows', 'Clickable subtitles', 'Built-in SRS flashcards'], link: 'https://lingopie.com', accent: 'border-blue-500' },
              { title: 'italki', icon: '🗣️', desc: '1-on-1 lessons with native teachers. Fast transition to active speaking.', features: ['Certified teachers', 'Pay per lesson', '24/7 availability'], link: 'https://italki.com', accent: 'border-indigo-500' },
              { title: 'Assimil', icon: '📚', desc: 'The "Gold Standard" of self-study books. Intuitive assimilation method.', features: ['Bilingual parallel text', 'Natural audio', 'Grammar in context'], link: '#', accent: 'border-purple-500' },
              { title: 'Anki', icon: '🃏', desc: 'Powerful spaced-repetition flashcards. Essential for retention.', features: ['100% customizable', 'Proven SRS algorithm', 'Community decks'], link: 'https://apps.ankiweb.net/', accent: 'border-pink-500' }
            ].map((p, i) => (
              <div key={i} className={`bg-white border-2 ${p.accent} p-8 rounded-3xl shadow-sm hover:shadow-xl transition-all flex flex-col`}>
                <div className="text-4xl mb-6">{p.icon}</div>
                <h3 className="text-xl font-bold mb-3">{p.title}</h3>
                <p className="text-sm text-gray-500 mb-6 flex-grow">{p.desc}</p>
                <ul className="space-y-2 mb-8">
                  {p.features.map((f, j) => (
                    <li key={j} className="text-xs font-bold text-gray-400 flex items-center gap-2">
                      <Check size={14} className="text-green-500" /> {f}
                    </li>
                  ))}
                </ul>
                <a href={p.link} target="_blank" className="w-full py-3 bg-gray-900 text-white rounded-xl text-center font-bold text-sm hover:bg-gray-800 transition-all">Get Started</a>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
