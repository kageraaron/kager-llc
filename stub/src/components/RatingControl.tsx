'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rateShow } from '@/app/actions';

/**
 * Rate a past show, with an optional short review.
 *
 * The review is NOT private — it rides on the attendance row, so accepted
 * friends see it. The copy says so, because the private note sitting directly
 * below this on the same page behaves the opposite way.
 */
export function RatingControl({
  eventId,
  initialRating,
  initialReview,
  sharedWithFriends,
}: {
  eventId: string;
  initialRating: number | null;
  initialReview: string | null;
  sharedWithFriends: boolean;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hover, setHover] = useState<number | null>(null);
  const [review, setReview] = useState(initialReview ?? '');
  const [open, setOpen] = useState(!!initialReview);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reviewDirty = review !== (initialReview ?? '');

  function commit(next: number | null, nextReview = review) {
    setError(null);
    startTransition(async () => {
      const res = await rateShow(eventId, next, nextReview);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        router.refresh();
      } else {
        setError(res.error);
        setRating(initialRating); // roll back the optimistic star
      }
    });
  }

  function pick(value: number) {
    // Clicking the current rating clears it, which is the only way back to unrated.
    const next = value === rating ? null : value;
    setRating(next);
    if (next === null) setReview('');
    commit(next, next === null ? '' : review);
  }

  const shown = hover ?? rating ?? 0;

  return (
    <section style={{ marginTop: 24 }}>
      <div className="spread">
        <div className="section-label" style={{ margin: 0 }}>How was it?</div>
        {saved && <span className="muted" style={{ fontSize: 11 }}>Saved</span>}
      </div>

      <div
        className="row"
        style={{ gap: 4, marginTop: 6 }}
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={rating === n}
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => pick(n)}
            style={{
              fontSize: 30,
              lineHeight: 1,
              padding: '2px 2px',
              color: n <= shown ? 'var(--accent)' : 'var(--border)',
              transition: 'color .12s',
            }}
          >
            {n <= shown ? '★' : '☆'}
          </button>
        ))}

        {rating !== null && (
          <button
            className="muted"
            style={{ fontSize: 12, marginLeft: 8, textDecoration: 'underline' }}
            disabled={pending}
            onClick={() => pick(rating)}
          >
            Clear
          </button>
        )}
      </div>

      {rating !== null && (
        <div style={{ marginTop: 10 }}>
          {!open && !review ? (
            <button className="btn" onClick={() => setOpen(true)}>Add a few words</button>
          ) : (
            <>
              <textarea
                className="input"
                style={{ minHeight: 80 }}
                maxLength={1000}
                value={review}
                placeholder="Openers, the crowd, that one song..."
                onChange={(e) => setReview(e.target.value)}
              />
              <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                <span className="muted" style={{ marginRight: 'auto', fontSize: 11 }}>
                  {sharedWithFriends
                    ? 'Friends can see this. Your private note below stays yours.'
                    : 'This show is private, so only you can see this.'}
                </span>
                <button
                  className="btn btn-primary"
                  disabled={pending || !reviewDirty}
                  onClick={() => commit(rating)}
                >
                  {pending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </section>
  );
}

/** Read-only star row, for cards and friends' profiles. */
export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span style={{ color: 'var(--accent)', fontSize: size, letterSpacing: '1px' }}>
      {'★'.repeat(rating)}
      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - rating)}</span>
    </span>
  );
}
