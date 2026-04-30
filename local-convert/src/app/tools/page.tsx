'use client';

import Link from 'next/link';
import { CONVERSION_CATEGORIES } from '@/lib/formats';
import { useI18n } from '@/lib/i18n';

export default function ToolsPage() {
  const { t } = useI18n();

  return (
    <main className="main container">
      <section className="hero">
        <h1 className="hero__title">
          {t('tools_hero_title').split('conversion').map((part, i) => (
            <span key={i}>
              {part}
              {i === 0 && <span style={{ color: 'var(--primary)' }}>conversion</span>}
            </span>
          ))}
        </h1>
        <p className="hero__subtitle">
          {t('tools_hero_subtitle')}
        </p>
      </section>

      <div style={{ marginTop: '3rem' }}>
        {CONVERSION_CATEGORIES.map((category) => (
          <div key={category.name} style={{ marginBottom: '4rem' }}>
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{category.name}</h2>
              <p style={{ color: 'var(--text-muted)' }}>{category.description}</p>
            </div>
            <div className="catalog-grid">
              {category.conversions.map((conv) => (
                <Link
                  key={`${conv.from}-${conv.to}`}
                  href={`/convert/${conv.from.toLowerCase()}-to-${conv.to.toLowerCase()}`}
                  className="catalog-tile"
                >
                  <span className="catalog-tile__route">Convert</span>
                  <span className="catalog-tile__title">
                    {conv.from} <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>→</span>{' '}
                    <strong>{conv.to}</strong>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
