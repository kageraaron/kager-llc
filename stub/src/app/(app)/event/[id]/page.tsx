import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getEvent, getMyAttendance, getNote, getFriendsAtEvent } from '@/lib/queries';
import { formatEventDate, formatEventTime, venueLine, formatPrice } from '@/lib/format';
import { NoteEditor } from '@/components/NoteEditor';
import { AttendanceControls } from '@/components/AttendanceControls';
import { Setlist } from '@/components/Setlist';
import { RatingControl, Stars } from '@/components/RatingControl';
import { getCachedSetlist } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  const event = await getEvent(supabase, id);
  if (!event) notFound();

  const [attendance, note, friends] = await Promise.all([
    getMyAttendance(supabase, id, user!.id),
    getNote(supabase, id, user!.id),
    getFriendsAtEvent(supabase, id, user!.id),
  ]);

  const isPast = new Date(event.starts_at).getTime() < Date.now();
  const image = event.image_url ?? event.headliner?.image_url;

  // Setlists only exist for shows that have happened, and are cached in the
  // database: a hit never expires (a past setlist does not change), a miss is
  // re-checked after a few days because entries get added late.
  const setlist =
    isPast && event.headliner?.name && process.env.SETLISTFM_API_KEY
      ? (await getCachedSetlist(event.id, event.headliner.name, event.starts_at, event.timezone)).setlist
      : null;

  return (
    <main className="page">
      <header className="page-header">
        <Link href={isPast ? '/archive' : '/upcoming'} className="muted" style={{ fontSize: 14 }}>
          &larr; Back
        </Link>
      </header>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 'var(--radius)' }}
        />
      )}

      <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '16px 0 4px' }}>
        {event.headliner?.name ?? event.name}
      </h1>
      {event.headliner && event.name !== event.headliner.name && (
        <div className="muted">{event.name}</div>
      )}

      <div className="stack" style={{ gap: 4, marginTop: 12 }}>
        <div>{formatEventDate(event.starts_at, event.timezone)} · {formatEventTime(event.starts_at, event.timezone)}</div>
        <div className="muted">{venueLine(event.venue)}</div>
        {attendance?.seat_info && <div className="muted">Seat: {attendance.seat_info}</div>}
        {attendance?.ticket_ref && <div className="muted">Order {attendance.ticket_ref}</div>}
        {attendance?.price_cents != null && (
          <div className="muted">Paid {formatPrice(attendance.price_cents)}</div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <AttendanceControls
          eventId={event.id}
          isPast={isPast}
          attendance={attendance ? { state: attendance.state, visibility: attendance.visibility } : null}
        />
      </div>

      {friends.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div className="section-label">
            {friends.length} friend{friends.length === 1 ? '' : 's'} {isPast ? 'went' : 'going'}
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {friends.map((f) => (
              <Link key={f.id} href={`/profile/${f.profile.handle}`} className="row">
                {f.profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar" src={f.profile.avatar_url} alt="" />
                ) : (
                  <div className="avatar" />
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 550 }}>{f.profile.display_name || f.profile.handle}</span>
                    {f.rating != null && <Stars rating={f.rating} size={12} />}
                  </div>
                  <div className="muted">@{f.profile.handle} · {f.state}</div>
                  {f.review && (
                    <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 3 }}>{f.review}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isPast && attendance && (
        <RatingControl
          eventId={event.id}
          initialRating={attendance.rating ?? null}
          initialReview={attendance.review ?? null}
          sharedWithFriends={attendance.visibility === 'friends'}
        />
      )}

      {setlist && <Setlist setlist={setlist} />}

      <NoteEditor eventId={event.id} initial={note?.body ?? ''} />

      <div className="stack" style={{ marginTop: 20 }}>
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
            Open on Ticketmaster
          </a>
        )}
      </div>
    </main>
  );
}
