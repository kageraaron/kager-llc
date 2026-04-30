'use client';

import { useState } from 'react';

interface EmbedCodeProps {
  slug: string;
  baseUrl: string;
}

export default function EmbedCode({ slug, baseUrl }: EmbedCodeProps) {
  const [copied, setCopied] = useState(false);
  const embedUrl = `${baseUrl}/embed/${slug}`;
  const iframeCode = `<div style="width: 100%; font-family: sans-serif;">\n  <iframe src="${embedUrl}" width="100%" height="600" style="border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden;" frameborder="0"></iframe>\n  <p style="font-size: 12px; color: #71717a; text-align: center; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 4px;">\n    Powered by <a href="${baseUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: bold;">Local-Convert</a>\n  </p>\n</div>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(iframeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card" style={{ marginTop: '4rem', padding: '2rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Embed this tool</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Want to use this {slug.replace('-to-', ' to ')} converter on your own website? Copy and paste the code below. 
        It's free, client-side, and helps spread the word about privacy-first tools.
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
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>
    </div>
  );
}
