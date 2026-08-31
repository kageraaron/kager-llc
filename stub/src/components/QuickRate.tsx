'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rateShow } from '@/app/actions';

/**
 * Rate a show you just saw, from the Archive list.
 *
 * The post-show moment is the whole loop of a memory app, and until now nothing
 * triggered it: `RatingControl` lives on `/event/[id]`, so rating a show meant
 * remembering to go and open it. A discovery app has no reason to build this —
 * its loop ends at purchase — which is exactly why it is worth building here.
 *
 * Deliberately narrower than `RatingControl`: stars only, no review box. This is
 * a prompt, not a form; the review is still a thing you go to the show's page to
 * write, and tapping a star here does not stop you doing that later.
 */
export function QuickRate({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(value: number) {
    setError(null);
    setPicked(value); // optimistic — the row disappears from the prompt on refresh
    startTransition(async () => {
      const res = await rateShow(eventId, value, '');
      if (res.ok) router.refresh();
      else {
        setError(res.error);
        setPicked(null);
      }
    });
  }

  const shown = hover ?? picked ?? 0;

  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="muted" style={{ fontSize: 12 }}>How was it?</span>

      <div
        className="row"
        style={{ gap: 2, marginLeft: 'auto' }}
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
        aria-label="Rating"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            // A rating is one choice out of five, not five toggles — `radio`
            // with `aria-checked` is what conveys that they are exclusive.
            role="radio"
            aria-checked={picked === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => pick(n)}
            className="quick-star"
            style={{ color: n <= shown ? 'var(--accent)' : 'var(--text-dim)' }}
          >
            {n <= shown ? '★' : '☆'}
          </button>
        ))}
      </div>

      {error && <span className="error" style={{ fontSize: 12 }}>{error}</span>}
    </div>
  );
}
