'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { respondToEventInvite } from '@/app/actions';
import { displayEventName, eventZone, formatEventDate, initials, venueLine } from '@/lib/format';
import type { EventInvite } from '@/lib/queries';

/**
 * A show a friend sent you, waiting on an answer.
 *
 * Accepting records it as `interested`, not `going` — being invited is not the
 * same as holding a ticket, and the Upcoming list treats `going` as settled.
 */
export function EventInviteCard({ invite }: { invite: EventInvite }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const title = displayEventName(invite.event);
  const image = invite.event.image_url ?? invite.event.headliner?.image_url;
  const from = invite.from?.display_name || invite.from?.handle || 'A friend';

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await respondToEventInvite(invite.id, accept);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="card" style={{ flexDirection: 'column', gap: 10 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        <strong>{from}</strong> sent you this show
      </div>

      <Link href={`/event/${invite.event.id}`} className="row" style={{ gap: 10 }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="thumb" style={{ width: 44, height: 44 }} src={image} alt="" />
        ) : (
          <div className="thumb thumb-initials" style={{ width: 44, height: 44 }}>
            {initials(title)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div className="muted">{venueLine(invite.event.venue)}</div>
          <div className="muted">
            {formatEventDate(invite.event.starts_at, eventZone(invite.event))}
          </div>
        </div>
      </Link>

      {invite.message && <div style={{ fontSize: 13, lineHeight: 1.45 }}>{invite.message}</div>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" disabled={pending} onClick={() => respond(true)}>
          Interested
        </button>
        <button className="btn" disabled={pending} onClick={() => respond(false)}>
          No thanks
        </button>
      </div>

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
