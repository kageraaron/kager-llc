'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import AdSlot from '@/components/Ads/AdSlot';
import { CONVERSION_CATEGORIES } from '@/lib/formats';
import { useI18n } from '@/lib/i18n';

// Strict lazy-loading for the heavy Converter component.
// This prevents WASM-related libraries and heavy conversion logic from
// being included in the initial JS payload, crucial for mobile SEO.
const Converter = dynamic(() => import('@/components/Converter/Converter'), {
  ssr: false,
  loading: () => (
    <div 
      className="card" 
      style={{ 
        height: '300px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--surface-subtle)',
        border: '2px dashed var(--border)'
      }}
    >
      <div className="spinner spin" aria-hidden />
    </div>
  ),
});

const FEATURE_ICONS: Record<string, React.ReactElement> = {
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  infinity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M18.178 8a5 5 0 1 0 0 8c1.414 0 2.768-.586 3.768-1.628L22 14M6.178 16a5 5 0 1 1 0-8c1.414 0 2.768.586 3.768 1.628l9.054 8.744" />
    </svg>
  ),
};

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="main container">
      {/* Hero with inline converter — drop a file and go */}
      <section className="hero">
        <div className="hero__eyebrow">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          {t('hero_eyebrow')}
        </div>
        <h1 className="hero__title">
          {t('hero_title').split('{highlight}').map((part, i) => (
            <span key={i}>
              {part}
              {i === 0 && <span style={{ color: 'var(--primary)' }}>{t('hero_title_highlight')}</span>}
            </span>
          ))}
        </h1>
        <p className="hero__subtitle">
          {t('hero_subtitle')}
        </p>
      </section>

      <div style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
        <Converter />
      </div>

      <AdSlot format="banner" style={{ marginTop: '3rem' }} />

      {/* Conversion catalog */}
      <section id="tools" style={{ marginTop: '5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>{t('tools_title')}</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {t('tools_subtitle')}
          </p>
        </div>

        {CONVERSION_CATEGORIES.map((category) => (
          <div key={category.name} style={{ marginBottom: '3rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.35rem', marginBottom: '0.25rem' }}>{t(category.name)}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t(category.description)}</p>
            </div>
            <div className="catalog-grid">
              {category.conversions.map((conv) => (
                <Link
                  key={`${conv.from}-${conv.to}`}
                  href={`/convert/${conv.from.toLowerCase()}-to-${conv.to.toLowerCase()}`}
                  className="catalog-tile"
                >
                  <span className="catalog-tile__route">{t('catalog_tile_convert')}</span>
                  <span className="catalog-tile__title">
                    {conv.from} <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>→</span>{' '}
                    <strong>{conv.to}</strong>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <AdSlot format="banner" style={{ height: 250, maxWidth: 970, marginTop: '2rem' }} />

      {/* Why local */}
      <section
        id="why"
        style={{
          marginTop: '5rem',
          padding: '3rem 2rem',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          <h2>{t('why_title')}</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {t('why_subtitle')}
          </p>
        </div>

        <div className="feature-grid">
          <div className="feature">
            <div className="feature__icon">{FEATURE_ICONS.shield}</div>
            <h3>{t('feature_privacy_title')}</h3>
            <p>
              {t('feature_privacy_desc')}
            </p>
          </div>
          <div className="feature">
            <div className="feature__icon">{FEATURE_ICONS.zap}</div>
            <h3>{t('feature_speed_title')}</h3>
            <p>
              {t('feature_speed_desc')}
            </p>
          </div>
          <div className="feature">
            <div className="feature__icon">{FEATURE_ICONS.infinity}</div>
            <h3>{t('feature_limit_title')}</h3>
            <p>
              {t('feature_limit_desc')}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
