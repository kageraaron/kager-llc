import Link from 'next/link';
import {
  displayEventName,
  displayStatus,
  eventDateParts,
  eventZone,
  formatEventTime,
  initials,
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
}

export function EventCard({ event, friends, badge, state, rating, hasSetlist }: Props) {
  // Not `event.timezone` directly: a provider that gave us no zone would render
  // this card in the server's zone, which is UTC. See `eventZone`.
  const zone = eventZone(event);
  const { month, day } = eventDateParts(event.starts_at, zone);
  const image = event.image_url ?? event.headliner?.image_url;
  const title = displayEventName(event);
  const attending = ATTENDANCE_LABELS[state ?? ''];
  const isPast = new Date(event.starts_at).getTime() < Date.now();
  const status = displayStatus(event.status, isPast);

  return (
    <Link href={`/event/${event.id}`} className="card">
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
        <div className="meta">{venueLine(event.venue)}</div>
        <div className="meta">
          {formatEventTime(event.starts_at, zone)}
          {status && ` · ${status}`}
        </div>

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
}
