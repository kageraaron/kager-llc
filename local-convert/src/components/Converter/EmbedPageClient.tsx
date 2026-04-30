'use client';

import Converter from '@/components/Converter/Converter';
import AdSlot from '@/components/Ads/AdSlot';
import { useI18n } from '@/lib/i18n';
import Link from 'next/link';

interface EmbedPageClientProps {
  from: string;
  to: string;
  supported: boolean;
  baseUrl: string;
}

export default function EmbedPageClient({
  from,
  to,
  supported,
  baseUrl
}: EmbedPageClientProps) {
  const { t } = useI18n();

  return (
    <main style={{ padding: '1rem', maxWidth: '100%', overflow: 'hidden' }}>
      <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
          {from} to {to} Converter
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {t('hero_eyebrow').split('•')[0]} {/* 100% Private & Local style */}
        </p>
      </div>

      <div style={{ width: '100%' }}>
        {supported ? (
          <Converter from={from} to={to} />
        ) : (
          <div
            className="card"
            style={{ textAlign: 'center', padding: '2rem' }}
          >
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {t('embed_not_supported').replace('{from}', from).replace('{to}', to)}
            </p>
            <Link href={baseUrl} target="_blank" className="btn btn--primary">
              {t('btn_browse_all')}
            </Link>
          </div>
        )}
      </div>

      <AdSlot format="banner" style={{ marginTop: '1.5rem' }} />

      <div style={{ 
        marginTop: '2rem', 
        paddingTop: '1rem',
        borderTop: '1px solid var(--border)',
        textAlign: 'center', 
        fontSize: '0.8rem', 
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem'
      }}>
        <span>{t('embed_powered_by')}</span>
        <a 
          href={baseUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            color: 'var(--primary)', 
            textDecoration: 'none', 
            fontWeight: '800',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Local-Convert
        </a>
      </div>
    </main>
  );
}
