'use client';

import Link from 'next/link';
import Converter from '@/components/Converter/Converter';
import AdSlot from '@/components/Ads/AdSlot';
import EmbedCode from '@/components/Embed/EmbedCode';
import { useI18n } from '@/lib/i18n';

interface ConvertPageClientProps {
  slug: string;
  from: string;
  to: string;
  supported: boolean;
  related: Array<{ from: string; to: string }>;
  baseUrl: string;
}

export default function ConvertPageClient({
  slug,
  from,
  to,
  supported,
  related,
  baseUrl
}: ConvertPageClientProps) {
  const { t } = useI18n();

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginBottom: '1.25rem',
        }}
      >
        <Link href="/">{t('nav_home')}</Link>
        <span>·</span>
        <span>{from} to {to}</span>
      </div>

      <section className="hero" style={{ marginTop: 0 }}>
        <h1 className="hero__title">
          {t('convert_page_title').replace('{from}', from).replace('{to}', to).split('{highlight}').map((part, i) => (
            <span key={i}>
              {part}
              {i === 0 && <span style={{ color: 'var(--primary)' }}>{t('convert_page_title_highlight')}</span>}
            </span>
          ))}
        </h1>
        <p className="hero__subtitle">
          {t('drop_specific_subheading').replace('{from}', from).replace('{to}', to)}
        </p>
      </section>

      {/* Inline converter — pinned to this format pair */}
      <div style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
        {supported ? (
          <Converter from={from} to={to} />
        ) : (
          <div
            className="card"
            style={{ textAlign: 'center', padding: '2.5rem' }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>{t('convert_not_supported')}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {t('convert_not_supported_desc').replace('{from}', from).replace('{to}', to)}
            </p>
            <Link href="/" className="btn btn--primary">{t('btn_browse_all')}</Link>
          </div>
        )}
      </div>

      <AdSlot format="banner" style={{ marginTop: '3rem' }} />

      <EmbedCode slug={slug} baseUrl={baseUrl} />

      {/* Why this tool */}
      <section style={{ marginTop: '4rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          {t('why_this_tool').replace('{from}', from).replace('{to}', to)}
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto' }}>
          {t('why_this_tool_desc')}
        </p>

        <div className="feature-grid">
          <div className="feature">
            <h3>{t('feature_privacy_title')}</h3>
            <p>
              {t('feature_privacy_desc')}
            </p>
          </div>
          <div className="feature">
            <h3>{t('feature_speed_title')}</h3>
            <p>
              {t('feature_speed_desc')}
            </p>
          </div>
          <div className="feature">
            <h3>{t('feature_limit_title')}</h3>
            <p>
              {t('feature_limit_desc')}
            </p>
          </div>
        </div>
      </section>

      {/* Related conversions */}
      {related.length > 0 && (
        <section style={{ marginTop: '4rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>{t('more_from').replace('{from}', from)}</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            {t('related_desc').replace('{from}', from)}
          </p>
          <div className="catalog-grid">
            {related.map((conv) => (
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
        </section>
      )}

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '5rem auto 0' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>{t('faq_title')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <details className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              {t('faq_safety_q').replace('{from}', from).replace('{to}', to)}
            </summary>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              {t('faq_safety_a')}
            </p>
          </details>
          <details className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('faq_install_q')}</summary>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              {t('faq_install_a')}
            </p>
          </details>
          <details className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('faq_limit_q')}</summary>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              {t('faq_limit_a')}
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
