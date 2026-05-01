'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n';

interface EmbedCodeProps {
  slug: string;
  baseUrl: string;
}

export default function EmbedCode({ slug, baseUrl }: EmbedCodeProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const embedUrl = `${baseUrl}/embed/${slug}`;
  const iframeCode = `<div style="width: 100%; font-family: sans-serif;">\n  <iframe src="${embedUrl}" width="100%" height="600" style="border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden;" frameborder="0"></iframe>\n  <p style="font-size: 12px; color: #71717a; text-align: center; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 4px;">\n    ${t('embed_powered_by')} <a href="${baseUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: bold;">Local-Convert</a>\n  </p>\n</div>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(iframeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card" style={{ marginTop: '4rem', padding: '2rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>{t('embed_title')}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        {t('embed_desc').replace('{slug}', slug.replace('-to-', ' to '))}
      </p>
      
      <div style={{ position: 'relative' }}>
        <pre style={{ 
          background: 'var(--surface-2)', 
          padding: '1.25rem', 
          borderRadius: 'var(--radius)', 
          fontSize: '0.85rem',
          overflowX: 'auto',
          border: '1px solid var(--border)',
          lineHeight: '1.5'
        }}>
          <code>{iframeCode}</code>
        </pre>
        <button 
          onClick={copyToClipboard}
          className="btn btn--secondary"
          style={{ 
            position: 'absolute', 
            top: '0.75rem', 
            right: '0.75rem',
            padding: '0.4rem 0.8rem',
            fontSize: '0.75rem'
          }}
        >
          {copied ? t('btn_copied') : t('btn_copy')}
        </button>
      </div>
    </div>
  );
}
