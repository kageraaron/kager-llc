import Link from 'next/link';
import {
  displayEventName,
  displayStatus,
  eventDateParts,
  eventZone,
  formatEventTime,
  initials,
  relativeDay,
  venueLine,
} from '@/lib/format';
import { Stars } from '@/components/RatingControl';
import type { EventRow } from '@/lib/queries';

/** Attendance states worth a pill. 'went' is implied by the show being past. */
const ATTENDANCE_LABELS: Record<string, { label: string; tone: string }> = {
  going: { label: 'Going', tone: 'going' },
  interested: { label: 'Interested', tone: 'interested' },
};

interface Props {
  event: EventRow;
  /** Small avatar stack of friends also attending. */
  friends?: { id: string; handle: string; display_name: string; avatar_url: string | null }[];
  badge?: { label: string; tone?: 'going' | 'review' | 'interested' };
  /**
   * The viewer's own attendance state, shown as the first pill. Surfacing this
   * on the list is the point: "Going" means the tickets are already bought,
   * "Interested" means they are not, and that is the distinction you want
   * without opening every show.
   */
  state?: string | null;
  /** 1-5 when the viewer has rated this show. */
  rating?: number | null;
  /** A setlist is already cached for this show — see `getSetlistFlags`. */
  hasSetlist?: boolean;
  /**
   * Ledger geometry: a smaller thumb and one metadata line instead of two,
   * roughly halving the row height.
   *
   * Upcoming and Archive are different jobs wearing the same card today. Upcoming
   * is a short to-do list where a 64px thumb aids recognition; Archive is a
   * ledger that can run to hundreds of rows, where that same thumb is what makes
   * the history unscannable. Same component, because the two must stay visually
   * related — a separate one would drift.
   */
  dense?: boolean;
  /**
   * Rendered in a strip joined to the bottom of the card, OUTSIDE the link.
   *
   * The card is a `<Link>`, so anything interactive has to live outside it —
   * a button nested in an anchor is invalid and behaves unpredictably on touch.
   */
  footer?: React.ReactNode;
}

export function EventCard({
  event,
  friends,
  badge,
  state,
  rating,
  hasSetlist,
  dense = false,
  footer,
}: Props) {
  // Not `event.timezone` directly: a provider that gave us no zone would render
  // this card in the server's zone, which is UTC. See `eventZone`.
  const zone = eventZone(event);
  const { month, day } = eventDateParts(event.starts_at, zone);
  const image = event.image_url ?? event.headliner?.image_url;
  const title = displayEventName(event);
  const attending = ATTENDANCE_LABELS[state ?? ''];
  const isPast = new Date(event.starts_at).getTime() < Date.now();
  const status = displayStatus(event.status, isPast);

  const card = (
    <Link href={`/event/${event.id}`} className={`card${dense ? ' card-dense' : ''}`}>
      <div className="date-chip">
        <div className="mon">{month}</div>
        <div className="day">{day}</div>
      </div>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="thumb" src={image} alt="" loading="lazy" />
      ) : (
        <div className="thumb thumb-initials">{initials(title)}</div>
      )}

      <div className="body">
        <div className="title">{title}</div>
        {dense ? (
          <div className="meta">
            {[venueLine(event.venue), formatEventTime(event.starts_at, zone), status]
              .filter(Boolean)
              .join(' · ')}
          </div>
        ) : (
          <>
        <div className="meta">{venueLine(event.venue)}</div>
        <div className="meta">
          {/*
            * Proximity leads on an upcoming row. "Tomorrow" is what the eye is
            * actually scanning a to-do list for, and it is the one fact the
            * date chip beside it cannot convey — SEP 2 means nothing without
            * today's date to subtract it from. Past rows say nothing: the
            * archive is read by date, and "2 years ago" on every line is noise.
            */}
          {!isPast && <span className="meta-lead">{relativeDay(event.starts_at)} · </span>}
          {formatEventTime(event.starts_at, zone)}
          {status && ` · ${status}`}
        </div>
          </>
        )}

        {rating != null && (
          <div style={{ marginTop: 5 }}><Stars rating={rating} /></div>
        )}

        {(friends?.length || badge || attending || hasSetlist) && (
          <div className="row" style={{ marginTop: 7 }}>
            {attending && <span className={`pill pill-${attending.tone}`}>{attending.label}</span>}
            {hasSetlist && <span className="pill">Setlist</span>}
            {badge && <span className={`pill ${badge.tone ? `pill-${badge.tone}` : ''}`}>{badge.label}</span>}
            {friends && friends.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <div className="avatar-stack">
                  {friends.slice(0, 4).map((f) =>
                    f.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={f.id} className="avatar" src={f.avatar_url} alt={f.display_name || f.handle} />
                    ) : (
                      <div key={f.id} className="avatar" />
                    ),
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  {friends.length === 1
                    ? (friends[0].display_name || friends[0].handle)
                    : `${friends.length} friends`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );

  if (!footer) return card;

  return (
    <div className="card-shell">
      {card}
      <div className="card-footer">{footer}</div>
    </div>
  );
}
