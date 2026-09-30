'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { joinHousehold } from '@/app/actions';

export function JoinHousehold({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string[] | null>(null);

  function join() {
    setError(null);
    startTransition(async () => {
      const res = await joinHousehold(token);
      if (res.ok) setJoined(res.others);
      else setError(res.error);
    });
  }

  if (joined) {
    const names = joined.length > 0 ? joined.join(' and ') : 'your household';
    return (
      <div className="empty">
        <h2>You&rsquo;re in</h2>
        <p>You now share shows, notes and the Inbox with {names}.</p>
        <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
          <Link className="btn btn-primary btn-block" href="/upcoming">Go to Upcoming</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="empty">
      <h2>Join this household?</h2>
      <p>
        You&rsquo;ll share one list of shows, one note per show and one Inbox. Anything
        already in your Stub moves across, and shows you both had are merged.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
        <button className="btn btn-primary btn-block" disabled={pending} onClick={join}>
          {pending ? 'Joining…' : 'Join household'}
        </button>
        <Link className="btn btn-block" href="/upcoming">Not now</Link>
      </div>
    </div>
  );
}
