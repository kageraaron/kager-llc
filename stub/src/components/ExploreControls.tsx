'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addExistingEvent, refreshExplore } from '@/app/actions';

/** Put an Explore show on the household's list as "interested". */
export function ExploreAddButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="footer-actions">
      {error && <span className="error" style={{ marginRight: 'auto' }}>{error}</span>}
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await addExistingEvent(eventId, 'interested');
            if (res.ok) router.refresh();
            else setError(res.error);
          })
        }
      >
        {pending ? 'Adding…' : 'Interested'}
      </button>
    </div>
  );
}

/** Check Ticketmaster for the stalest artists now instead of waiting for tonight. */
export function ExploreRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="head-actions">
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setNote(null);
            const res = await refreshExplore();
            if (!res.ok) setNote(res.error);
            else if (res.checked === 0) setNote('Everything was checked today');
            else setNote(`Checked ${res.checked} artist${res.checked === 1 ? '' : 's'}`);
            router.refresh();
          })
        }
      >
        {pending ? 'Checking…' : 'Refresh'}
      </button>
      {note && <span className="fine">{note}</span>}
    </div>
  );
}
