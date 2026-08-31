'use client';

import { useState, useTransition } from 'react';
import { getTrmnlUrl, rotateTrmnlToken } from '@/app/actions';

/**
 * TRMNL display setup. Like the calendar feed, the URL is a bearer token, so it
 * is fetched on demand rather than rendered into every settings load.
 *
 * There is no "connect" handshake to run: a TRMNL private plugin is configured
 * on TRMNL's side, and all it needs from Stub is this URL. So the whole of the
 * integration the user has to do is copy one string into one field.
 */
export function TrmnlConnect() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const res = await getTrmnlUrl();
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    });
  }

  function rotate() {
    if (!confirm('Rotate the link? Your TRMNL plugin will show an error until you paste the new URL into it.')) return;
    setError(null);
    startTransition(async () => {
      const res = await rotateTrmnlToken();
      if (res.ok) {
        setUrl(res.url);
        setCopied(false);
      } else {
        setError(res.error);
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link and copy it manually.');
    }
  }

  return (
    <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
      <div className="spread">
        <strong>TRMNL display</strong>
        <span className="pill">E-ink</span>
      </div>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Put your next shows on a TRMNL panel. Create a private plugin with the
        Polling strategy, paste this URL in, and it refreshes on its own.
      </p>

      {!url ? (
        <button className="btn btn-block" disabled={pending} onClick={reveal}>
          {pending ? 'Loading…' : 'Show my TRMNL link'}
        </button>
      ) : (
        <>
          <code
            style={{
              display: 'block',
              fontSize: 11,
              wordBreak: 'break-all',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 10px',
              lineHeight: 1.4,
            }}
          >
            {url}
          </code>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              className="btn btn-primary"
              style={{ flex: 1 }}
              href="https://trmnl.com/integrations/private-plugin"
              target="_blank"
              rel="noreferrer noopener"
            >
              New plugin
            </a>
          </div>

          <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
            Anyone with this link can see the shows you are going to. Rotate it if
            you share it by accident.
          </p>
          <button className="btn btn-block" disabled={pending} onClick={rotate}>
            Rotate link
          </button>
        </>
      )}

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
