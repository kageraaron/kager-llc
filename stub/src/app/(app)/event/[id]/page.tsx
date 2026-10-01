import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getEvent, getAttendance, getNote } from '@/lib/queries';
import { getHouseholdId } from '@/lib/household';
import {
  displayEventName,
  eventZone,
  formatEventDate,
  eventTimeOrNull,
  initials,
  ticketVendorName,
  venueLine,
} from '@/lib/format';
import { NoteEditor } from '@/components/NoteEditor';
import { TicketDetails } from '@/components/TicketDetails';
import { AttendanceControls } from '@/components/AttendanceControls';
import { Setlist } from '@/components/Setlist';
import { RatingControl } from '@/components/RatingControl';
import { getCachedSetlist } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  const event = await getEvent(supabase, id);
  if (!event) notFound();

  const householdId = await getHouseholdId(supabase, user!.id);
  const [attendance, note] = await Promise.all([
    getAttendance(supabase, id, householdId),
    getNote(supabase, id, householdId),
  ]);

  const isPast = new Date(event.starts_at).getTime() < Date.now();
  const image = event.image_url ?? event.headliner?.image_url;
  const title = displayEventName(event);
  // See `eventZone`: rendering a zone-less row directly would use the server's
  // zone, which is UTC, and show a 10pm club show as 5:00 AM the next morning.
  const zone = eventZone(event);

  // Setlists only exist for shows that have happened, and are cached in the
  // database: a hit never expires (a past setlist does not change), a miss is
  // re-checked after a few days because entries get added late.
  const setlist =
    isPast && event.headliner?.name && process.env.SETLISTFM_API_KEY
      ? (await getCachedSetlist(event.id, event.headliner.name, event.starts_at, zone)).setlist
      : null;

  return (
    <main className="page">
      <header className="page-header">
        <Link href={isPast ? '/archive' : '/upcoming'} className="muted" style={{ fontSize: 13 }}>
          &larr; Back
        </Link>
      </header>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 'var(--radius)' }}
        />
      ) : (
        <div
          className="thumb thumb-initials"
          style={{ width: '100%', aspectRatio: '16/9', height: 'auto', borderRadius: 'var(--radius)', fontSize: 42 }}
        >
          {initials(title)}
        </div>
      )}

      <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '16px 0 4px' }}>
        {title}
      </h1>
      {event.headliner && event.name !== event.headliner.name && (
        <div className="muted">{event.name}</div>
      )}

      <div className="stack" style={{ gap: 4, marginTop: 12 }}>
        {/* A time-unknown show shows its date alone rather than a 20:00 that
            nobody ever told us — see migration 0024. */}
        <div>
          {formatEventDate(event.starts_at, zone)}
          {eventTimeOrNull(event) && ` · ${eventTimeOrNull(event)}`}
        </div>
        <div className="muted">{venueLine(event.venue)}</div>
      </div>

      {attendance && (
        <TicketDetails
          eventId={event.id}
          quantity={attendance.ticket_quantity ?? null}
          priceCents={attendance.price_cents ?? null}
          seatInfo={attendance.seat_info ?? null}
          ticketRef={attendance.ticket_ref ?? null}
        />
      )}

      <div style={{ marginTop: 24 }}>
        <AttendanceControls
          eventId={event.id}
          isPast={isPast}
          attendance={attendance ? { state: attendance.state } : null}
        />
      </div>

      {isPast && attendance && (
        <RatingControl
          eventId={event.id}
          initialRating={attendance.rating ?? null}
          initialReview={attendance.review ?? null}
        />
      )}

      {setlist && <Setlist setlist={setlist} />}

      <NoteEditor eventId={event.id} initial={note?.body ?? ''} />

      <div className="stack" style={{ marginTop: 24 }}>
        <a className="btn btn-block" href={`/api/events/${event.id}/ics`}>
          Add to calendar
        </a>
        {event.url && (
          <a
            className="btn btn-block"
            href={event.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open on {ticketVendorName(event.url) ?? 'the ticket site'}
          </a>
        )}
      </div>
    </main>
  );
}
