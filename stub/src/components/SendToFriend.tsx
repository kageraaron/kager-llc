'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteFriendToEvent } from '@/app/actions';

interface Friend {
  id: string;
  handle: string;
  display_name: string;
}

/**
 * "You should come to this" — send a show to a friend.
 *
 * Deliberately not a share sheet. A link tells the recipient about the show; an
 * invite puts it in their Inbox with your name on it and a one-tap way to add
 * it to their own calendar, which is the thing a link cannot do.
 *
 * `invited` seeds the already-sent set from the server so a reload does not
 * offer to re-send to someone who already has it.
 */
export function SendToFriend({
  eventId,
  friends,
  invited,
}: {
  eventId: string;
  friends: Friend[];
  invited: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set(invited));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (friends.length === 0) return null;

  function send(friend: Friend) {
    setError(null);
    startTransition(async () => {
      const res = await inviteFriendToEvent(eventId, friend.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent((prev) => new Set(prev).add(friend.id));
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button className="btn btn-block" onClick={() => setOpen(true)}>
        Send to a friend
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="section-label">Send to</div>
      {friends.map((f) => {
        const already = sent.has(f.id);
        return (
          <div key={f.id} className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 550 }}>{f.display_name || f.handle}</div>
              <div className="muted">@{f.handle}</div>
            </div>
            <button
              className={`btn ${already ? '' : 'btn-primary'}`}
              disabled={pending || already}
              onClick={() => send(f)}
            >
              {already ? 'Sent' : 'Send'}
            </button>
          </div>
        );
      })}
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <button className="btn btn-block" onClick={() => setOpen(false)}>Done</button>
    </div>
  );
}
