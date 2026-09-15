'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createManualEvent,
  lookupManualShow,
  addEventByTmId,
  type ManualMatch,
} from '@/app/actions';
import { formatEventDate } from '@/lib/format';

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
  onDone?: (result: { isPast: boolean }) => void;
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
    /** Date and time are separate inputs; only the date is ever required. */
    date: '',
    time: '',
    url: '',
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /*
   * Listings that might be this show. `null` means we have not looked yet; an
   * empty array means we looked and found nothing, which is how the second
   * submit knows to go ahead and create rather than searching again.
   */
  const [matches, setMatches] = useState<ManualMatch[] | null>(null);

  /*
   * A date in the past can stand on its own.
   *
   * You remember that you saw Alvvays at the Fillmore in May; you do not
   * remember that doors were at eight. Requiring a time made the only way to
   * log that show inventing one — and an invented time is indistinguishable
   * from a real one afterwards. A FUTURE show is different: you are reading its
   * time off a ticket as you type, and the reminder and calendar feed both
   * depend on it.
   */
  const isPast = form.date !== '' && new Date(`${form.date}T23:59`).getTime() < Date.now();
  const timeRequired = form.date !== '' && !isPast;

  const canSubmit =
    form.artistName.trim().length > 0 &&
    form.date.length > 0 &&
    (!timeRequired || form.time.length > 0);

  /** Local wall time the form is describing, with 20:00 standing in for "unknown". */
  const wallTime = () => `${form.date}T${form.time.length > 0 ? form.time : '20:00'}`;
  const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    /*
     * Look before creating, once. If a provider knows this show, the user gets
     * to confirm it rather than ending up with a thinner duplicate of a row the
     * catalog could have described properly. Finding nothing is the common case
     * for the shows this form exists for, and costs one free request.
     */
    if (matches === null) {
      startTransition(async () => {
        const res = await lookupManualShow({
          artistName: form.artistName,
          venueName: form.venueName,
          city: form.city,
          region: form.region,
          startsAt: wallTime(),
          timezone: browserZone(),
        });
        setMatches(res.matches);
        // Nothing to confirm — do not make the user press the button twice.
        if (res.matches.length === 0) create();
      });
      return;
    }

    create();
  }

  /*
   * Take the provider's version of this show instead of the typed one.
   *
   * Not `useMatch`: a `use` prefix marks a hook to React's lint rules, and this
   * is an event handler.
   */
  function chooseMatch(m: ManualMatch) {
    setError(null);
    startTransition(async () => {
      if (m.source === 'ticketmaster') {
        // Already a catalog path: brings artwork, a real venue and a true zone.
        const res = await addEventByTmId(m.id);
        if (res.ok) {
          if (afterAdd === 'open-event') router.push(`/event/${res.eventId}`);
          onDone?.({ isPast: false });
        } else setError(res.error);
        return;
      }

      /*
       * setlist.fm has no catalog upsert, so its value here is correcting what
       * the user typed — the real venue and city, and the date as archived.
       * Setlists carry no start time, which is why this always records the show
       * as time-unknown rather than inventing the 20:00 its candidate carries.
       */
      const date = m.localDate ?? form.date;
      const res = await createManualEvent({
        artistName: form.artistName,
        venueName: m.venueName ?? form.venueName,
        city: m.city ?? form.city,
        region: form.region,
        url: form.url,
        startsAt: `${date}T20:00`,
        timeKnown: false,
        timezone: browserZone(),
      });
      if (res.ok) {
        if (afterAdd === 'open-event') router.push(`/event/${res.eventId}`);
        onDone?.({ isPast: res.isPast });
      } else setError(res.error);
    });
  }

  function create() {
    startTransition(async () => {
      const timeKnown = form.time.length > 0;
      const res = await createManualEvent({
        artistName: form.artistName,
        venueName: form.venueName,
        city: form.city,
        region: form.region,
        url: form.url,
        /*
         * 20:00 stands in when the time is unknown. NOT midnight: the app
         * groups and labels shows in the venue's zone, so a midnight instant
         * lands on the previous day — and on 1 January, the previous year.
         * See migration 0024.
         */
        startsAt: `${form.date}T${timeKnown ? form.time : '20:00'}`,
        timeKnown,
        // The browser's zone is the best guess for a show the user is typing in.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (res.ok) {
        if (afterAdd === 'open-event') router.push(`/event/${res.eventId}`);
        onDone?.({ isPast: res.isPast });
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
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          // A lookup describes the values it was run against; editing them
          // makes it stale, so the next submit searches again.
          setMatches(null);
        }}
        {...props}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 8 }}>
      {field('artistName', 'Artist *', { placeholder: 'Overmono', required: true })}

      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 3 }}>{field('date', 'Date *', { type: 'date', required: true })}</div>
        <div style={{ flex: 2 }}>
          {field('time', timeRequired ? 'Time *' : 'Time', {
            type: 'time',
            required: timeRequired,
          })}
        </div>
      </div>
      {isPast && form.time === '' && (
        <p className="muted" style={{ margin: '-4px 0 0' }}>
          Leave the time blank if you don&rsquo;t remember it.
        </p>
      )}

      {field('venueName', 'Venue', { placeholder: 'The Midway' })}

      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}>{field('city', 'City', { placeholder: 'San Francisco' })}</div>
        <div style={{ flex: 1 }}>{field('region', 'State', { placeholder: 'CA', maxLength: 4 })}</div>
      </div>

      {field('url', 'Ticket link', { type: 'url', placeholder: 'https://axs.com/events/...' })}

      {matches && matches.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="muted">Is it one of these? A listing brings the real venue and date.</span>
          {matches.map((m) => (
            <button
              key={`${m.source}-${m.id}`}
              type="button"
              className="card"
              onClick={() => chooseMatch(m)}
              disabled={pending}
              style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <div className="body">
                <div className="title">{m.name}</div>
                <div className="meta">
                  {/* Noon UTC formatted in UTC is the listing's own date in every browser zone. */}
                  {[m.localDate && formatEventDate(`${m.localDate}T12:00:00Z`, 'UTC'), m.venueName, m.city]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button className="btn btn-primary btn-block" type="submit" disabled={pending || !canSubmit}>
        {pending
          ? 'Adding...'
          : matches && matches.length > 0
            ? 'None of these, add mine'
            : 'Add this show'}
      </button>
    </form>
  );
}
