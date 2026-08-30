'use client';

import { useState, useTransition } from 'react';
import { getFriendInviteUrl } from '@/app/actions';

/**
 * "Add me as a friend" link, generated on demand.
 *
 * Generated on click rather than rendered on every page load, so a user who
 * never shares one never has a live token sitting in the database.
 */
export function InviteLink() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load(rotate = false) {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await getFriendInviteUrl(rotate);
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    });
  }

  async function share() {
    if (!url) return;
    // The native share sheet is the right affordance on a phone, and this is a
    // PWA. It is absent on desktop, so the clipboard is the fallback.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Add me on Stub', url });
        return;
      } catch {
        // Cancelled, or unavailable in this context — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Could not copy — select the link and copy it by hand');
    }
  }

  if (!url) {
    return (
      <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
        <button className="btn btn-block" disabled={pending} onClick={() => load()}>
          {pending ? 'Creating…' : 'Get an invite link'}
        </button>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" style={{ flex: 1 }} readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn btn-primary" onClick={share}>
          {copied ? 'Copied' : 'Share'}
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
        Anyone who opens this becomes your friend. Good for 30 days.{' '}
        <button
          style={{ textDecoration: 'underline', padding: 0, font: 'inherit' }}
          disabled={pending}
          onClick={() => load(true)}
        >
          Replace it
        </button>{' '}
        to stop the old one working.
      </p>
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
