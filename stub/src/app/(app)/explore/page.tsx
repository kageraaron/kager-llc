import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getEventsByIds, type EventRow } from '@/lib/queries';
import { getExploreMatches, type ExploreReason } from '@/lib/explore';
import { resolveHouseholdHome } from '@/app/actions';
import { geocodePlace } from '@/lib/cache';
import { EventCard } from '@/components/EventCard';
import { ExploreAddButton, ExploreRefreshButton } from '@/components/ExploreControls';

export const dynamic = 'force-dynamic';

/** Within this of the centre counts as "near": a drive you'd make for a show. */
const NEAR_KM = 160;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

const REASON_LABEL: Record<ExploreReason, string> = {
  follow: 'You follow',
  went: 'Seen live',
  ticket: 'On your list',
};

/**
 * Upcoming shows by artists the household follows or has seen, that are not
 * already on its list, near home. The matching is `explore_events()` (0028);
 * freshness is the Ticketmaster refresh in `lib/explore.ts`.
 *
 * Local by default: a favourite band's date in Berlin is not something to act
 * on. The centre is the household's home city, or a place typed into the
 * location bar (`?near=`) when travelling. `?all=1` shows everywhere.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; near?: string }>;
}) {
  const params = await searchParams;
  const showAll = params.all === '1';
  const nearQuery = params.near?.trim().slice(0, 120) || null;
  const supabase = await createClient();

  const [matches, home, typed] = await Promise.all([
    getExploreMatches(supabase),
    resolveHouseholdHome(),
    nearQuery ? geocodePlace(nearQuery) : Promise.resolve(null),
  ]);
  // A typed place wins; one that doesn't resolve falls back to home, with a note.
  const center = typed ? { city: typed.label, lat: typed.lat, lng: typed.lng } : home;
  const notFound = nearQuery && !typed ? nearQuery : null;

  // Links keep whichever of `near` / `all` they don't change.
  const href = (next: { all?: boolean; near?: string | null }) => {
    const q = new URLSearchParams();
    const near = next.near === undefined ? (typed ? nearQuery : null) : next.near;
    if (near) q.set('near', near);
    if (next.all ?? showAll) q.set('all', '1');
    const qs = q.toString();
    return qs ? `/explore?${qs}` : '/explore';
  };
  const events = await getEventsByIds(supabase, matches.map((m) => m.event_id));
  const byId = new Map(events.map((e) => [e.id, e]));

  // The artist that put each show here, for the "why" line: the headliner
  // usually, a lineup act when that is who you follow.
  const lineupIds = [...new Set(matches.map((m) => m.artist_id))].filter(
    (id) => !events.some((e) => e.headliner?.id === id),
  );
  const names = new Map(events.flatMap((e) => (e.headliner ? [[e.headliner.id, e.headliner.name] as const] : [])));
  for (let i = 0; i < lineupIds.length; i += 60) {
    const { data } = await supabase.from('artists').select('id, name').in('id', lineupIds.slice(i, i + 60));
    for (const a of data ?? []) names.set(a.id, a.name);
  }

  type Row = { event: EventRow; reason: ExploreReason; artist: string | null; km: number | null };
  const rows: Row[] = matches
    .flatMap((m) => {
      const event = byId.get(m.event_id);
      if (!event) return [];
      const venue = event.venue;
      const km =
        center && venue?.lat != null && venue?.lng != null
          ? distanceKm(center, { lat: venue.lat, lng: venue.lng })
          : null;
      const artist = names.get(m.artist_id) ?? null;
      // Only say who when it isn't already the card's title.
      const shown = artist && artist !== event.headliner?.name ? artist : null;
      return [{ event, reason: m.reason, artist: shown, km }];
    })
    .sort((a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime());

  const near = center ? rows.filter((r) => r.km != null && r.km <= NEAR_KM) : [];
  const elsewhere = center ? rows.filter((r) => !(r.km != null && r.km <= NEAR_KM)) : rows;
  const miles = Math.round(NEAR_KM / 1.609);

  const list = (items: Row[]) =>
    items.map((r) => (
      <EventCard
        key={r.event.id}
        event={r.event}
        badge={{ label: r.artist ? `${REASON_LABEL[r.reason]}: ${r.artist}` : REASON_LABEL[r.reason] }}
        footer={<ExploreAddButton eventId={r.event.id} />}
      />
    ));

  const subtitle = !center
    ? 'Shows by artists you follow or have seen'
    : showAll
      ? `${rows.length} upcoming show${rows.length === 1 ? '' : 's'}, ${near.length} near ${center.city}`
      : `${near.length} show${near.length === 1 ? '' : 's'} within ${miles} miles of ${center.city}`;

  return (
    <main className="page">
      <header className="page-header">
        <div className="head-row">
          <div>
            <h1>Explore</h1>
            <div className="sub">{subtitle}</div>
          </div>
          <ExploreRefreshButton />
        </div>

        {/* A plain GET form: the place lives in the URL, so it survives a
            refresh and can be shared, and needs no client code. */}
        <form action="/explore" className="row" style={{ gap: 8, marginTop: 12 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            name="near"
            defaultValue={typed ? nearQuery ?? '' : ''}
            placeholder={home ? `Near ${home.city}. Travelling? Type a city` : 'City or town'}
            aria-label="Show concerts near"
          />
          {showAll && <input type="hidden" name="all" value="1" />}
          <button className="btn" type="submit">Go</button>
        </form>
        {(typed || notFound) && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {notFound && <>Couldn&rsquo;t find &ldquo;{notFound}&rdquo;. </>}
            {typed && home && <Link href={href({ near: null })}>Back to {home.city}</Link>}
            {typed && !home && <Link href={href({ near: null })}>Clear</Link>}
          </div>
        )}
      </header>

      {!center ? (
        <div className="empty">
          <h2>Where's home?</h2>
          <p>
            Explore shows upcoming concerts near you by artists you follow or have seen. Set a home
            city in Settings (either of you is enough), or type a place above.
          </p>
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            <Link className="btn btn-primary btn-block" href="/settings">Set home city</Link>
            {rows.length > 0 && !showAll && (
              <Link className="btn btn-block" href={href({ all: true })}>Show all {rows.length} anyway</Link>
            )}
          </div>
          {showAll && <div style={{ marginTop: 24, textAlign: 'left' }}>{list(rows)}</div>}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <h2>Nothing yet</h2>
          <p>
            Explore lists upcoming shows by artists you follow on Spotify or have been to see.
            Tap Refresh to check Ticketmaster for them now; it also runs every night.
          </p>
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            <Link className="btn btn-block" href="/settings/connections">Import from Spotify</Link>
          </div>
        </div>
      ) : (
        <>
          <section>
            {showAll && <div className="section-label">Near {center.city}</div>}
            {near.length > 0 ? (
              list(near)
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Nothing within {miles} miles right now. New dates are checked every night.
              </p>
            )}
          </section>
          {showAll ? (
            elsewhere.length > 0 && (
              <section>
                <div className="section-label">Further away</div>
                {list(elsewhere)}
                <p className="muted" style={{ fontSize: 12 }}>
                  <Link href={href({ all: false })}>Only near {center.city}</Link>
                </p>
              </section>
            )
          ) : (
            elsewhere.length > 0 && (
              <p className="muted" style={{ fontSize: 12 }}>
                {elsewhere.length} more further away. <Link href={href({ all: true })}>Show everywhere</Link>
              </p>
            )
          )}
        </>
      )}
    </main>
  );
}
