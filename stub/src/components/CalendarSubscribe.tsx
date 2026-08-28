'use client';

import { useState, useTransition } from 'react';
import { getCalendarUrl, rotateCalendarToken } from '@/app/actions';

/**
 * Calendar subscription. The feed URL contains a bearer token, so it is only
 * fetched on demand rather than rendered into the page on every settings load.
 */
export function CalendarSubscribe() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const res = await getCalendarUrl();
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    });
  }

  function rotate() {
    if (!confirm('Rotate the link? Any calendar already subscribed will stop updating.')) return;
    setError(null);
    startTransition(async () => {
      const res = await rotateCalendarToken();
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

  // webcal:// makes Apple Calendar and Google Calendar offer to subscribe
  // rather than downloading a one-off snapshot.
  const webcal = url?.replace(/^https?:/, 'webcal:');

  return (
    <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
      <div className="spread">
        <strong>Calendar subscription</strong>
        <span className="pill">Auto-updating</span>
      </div>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Subscribe once and every show you add appears in your calendar, with a
        reminder the day before. Your private notes are never included.
      </p>

      {!url ? (
        <button className="btn btn-block" disabled={pending} onClick={reveal}>
          {pending ? 'Loading…' : 'Show my calendar link'}
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
            <a className="btn btn-primary" style={{ flex: 1 }} href={webcal}>
              Subscribe
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
