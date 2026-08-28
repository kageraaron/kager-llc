'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmCandidate, rejectCandidate } from '@/app/actions';
import { formatEventDate, venueLine } from '@/lib/format';
import type { ParsedTicket } from '@/lib/types';

interface Props {
  candidate: {
    id: string;
    parsed: ParsedTicket;
    confidence: number;
    matched_event_id: string | null;
    message: { subject: string | null; from_addr: string | null } | null;
    event: {
      id: string;
      name: string;
      starts_at: string;
      timezone: string | null;
      image_url: string | null;
      venue: { name: string; city: string | null; region: string | null } | null;
    } | null;
  };
}

export function CandidateCard({ candidate }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'confirmed' | 'rejected' | null>(null);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, result: 'confirmed' | 'rejected') {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setDone(result);
        router.refresh();
      } else {
        setError(res.error ?? 'Something went wrong');
      }
    });
  }

  if (done) {
    return (
      <div className="card">
        <div className="body">
          <div className="muted">
            {done === 'confirmed' ? 'Added to your calendar.' : 'Dismissed.'}
          </div>
        </div>
      </div>
    );
  }

  const { parsed, event } = candidate;
  const pct = Math.round(candidate.confidence * 100);

  return (
    <div className="card" style={{ flexDirection: 'column', gap: 10 }}>
      <div className="spread">
        <span className="pill pill-review">
          {candidate.matched_event_id ? `${pct}% match` : 'No match found'}
        </span>
        {candidate.message?.from_addr && (
          <span className="muted" style={{ fontSize: 11 }}>
            {candidate.message.from_addr.replace(/.*<|>.*/g, '')}
          </span>
        )}
      </div>

      {/* What we think the email said. */}
      <div>
        <div className="section-label" style={{ margin: '0 0 4px' }}>From the email</div>
        <div style={{ fontWeight: 600 }}>{parsed.artistName ?? parsed.eventName ?? 'Unknown act'}</div>
        <div className="muted">
          {[parsed.venueName, parsed.city, parsed.region].filter(Boolean).join(' · ') || 'No venue found'}
        </div>
        <div className="muted">
          {parsed.startsAt ? formatEventDate(parsed.startsAt) : 'No date found'}
        </div>
      </div>

      {/* What we matched it to. */}
      {event ? (
        <div>
          <div className="section-label" style={{ margin: '0 0 4px' }}>Best match</div>
          <div className="row">
            {event.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" style={{ width: 44, height: 44 }} src={event.image_url} alt="" />
            ) : (
              <div className="thumb" style={{ width: 44, height: 44 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{event.name}</div>
              <div className="muted">{venueLine(event.venue)}</div>
              <div className="muted">{formatEventDate(event.starts_at, event.timezone)}</div>
            </div>
          </div>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Stub could not find this show in Ticketmaster. Add it from Browse if you still want it tracked.
        </p>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn"
          style={{ flex: 1 }}
          disabled={pending}
          onClick={() => act(() => rejectCandidate(candidate.id), 'rejected')}
        >
          Not a ticket
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={pending || !candidate.matched_event_id}
          onClick={() => act(() => confirmCandidate(candidate.id), 'confirmed')}
        >
          Yes, add it
        </button>
      </div>

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
