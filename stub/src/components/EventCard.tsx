import Link from 'next/link';
import { eventDateParts, formatEventTime, venueLine } from '@/lib/format';
import type { EventRow } from '@/lib/queries';

interface Props {
  event: EventRow;
  /** Small avatar stack of friends also attending. */
  friends?: { id: string; handle: string; display_name: string; avatar_url: string | null }[];
  badge?: { label: string; tone?: 'going' | 'review' };
}

export function EventCard({ event, friends, badge }: Props) {
  const { month, day } = eventDateParts(event.starts_at, event.timezone);
  const image = event.image_url ?? event.headliner?.image_url;

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
        <div className="thumb" />
      )}

      <div className="body">
        <div className="title">{event.headliner?.name ?? event.name}</div>
        <div className="meta">{venueLine(event.venue)}</div>
        <div className="meta">
          {formatEventTime(event.starts_at, event.timezone)}
          {event.status && event.status !== 'onsale' && ` · ${event.status}`}
        </div>

        {(friends?.length || badge) && (
          <div className="row" style={{ marginTop: 7 }}>
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
