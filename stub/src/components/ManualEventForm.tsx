'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createManualEvent } from '@/app/actions';

/**
 * Add a show no provider lists.
 *
 * Not an edge case: an AXS-sold club show can be absent from JamBase *and*
 * Ticketmaster. Afterparties and late-announced club nights are the weak spot
 * of every aggregator, so this needs to be a first-class path, not buried.
 */
export function ManualEventForm({
  onDone,
  afterAdd = 'open-event',
}: {
  /** Called after a successful add, for the caller to collapse or close itself. */
  onDone?: () => void;
  /**
   * Where the user ends up once the show exists.
   *
   * `open-event` (default) navigates to the new show's page. That is the right
   * answer wherever there is no list behind the form — Browse, or a direct link
   * — because the event page IS the confirmation that the add worked.
   *
   * `stay` leaves the user where they are, for the Add sheet: it sits over
   * Upcoming or Archive, which refresh to show the new row, so navigating as
   * well would throw away the place the sheet exists to preserve.
   */
  afterAdd?: 'open-event' | 'stay';
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    artistName: '',
    venueName: '',
    city: '',
    region: '',
    startsAt: '',
    url: '',
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = form.artistName.trim().length > 0 && form.startsAt.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createManualEvent({
        ...form,
        // The browser's zone is the best guess for a show the user is typing in.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (res.ok) {
        if (afterAdd === 'open-event') router.push(`/event/${res.eventId}`);
        onDone?.();
      } else {
        setError(res.error);
      }
    });
  }

  const field = (
    key: keyof typeof form,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="muted">{label}</span>
      <input
        className="input"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 8 }}>
      {field('artistName', 'Artist *', { placeholder: 'Overmono', required: true })}
      {field('startsAt', 'Date and time *', { type: 'datetime-local', required: true })}
      {field('venueName', 'Venue', { placeholder: 'The Midway' })}

      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}>{field('city', 'City', { placeholder: 'San Francisco' })}</div>
        <div style={{ flex: 1 }}>{field('region', 'State', { placeholder: 'CA', maxLength: 4 })}</div>
      </div>

      {field('url', 'Ticket link', { type: 'url', placeholder: 'https://axs.com/events/...' })}

      {error && <p className="error">{error}</p>}

      <button className="btn btn-primary btn-block" type="submit" disabled={pending || !canSubmit}>
        {pending ? 'Adding...' : 'Add this show'}
      </button>
    </form>
  );
}
