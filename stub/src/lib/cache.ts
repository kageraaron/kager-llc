import { createAdminClient } from '@/lib/supabase/admin';
import { getSetlistForEvent, countSongs, type SFMFullSetlist } from '@/lib/providers/setlistfm';
import { geocode, type Place } from '@/lib/providers/geocode';
import { searchArtistConcerts, type ArtistConcerts } from '@/lib/providers/spotifyconcerts';

/**
 * Provider response caching, backed by Postgres.
 *
 * Postgres rather than an in-process map because Vercel runs each request in a
 * short-lived, independently-scaled function: an in-memory cache would be cold
 * on most requests and would not be shared between users, which is exactly
 * where the wins are ("what's on near me" is the same query for everyone in a
 * city).
 *
 * All writes use the service role — these are shared caches, not per-user rows.
 */

// A miss is worth re-checking: setlist.fm entries are added by users days after
// a show. A hit never is — a past setlist does not change.
const SETLIST_MISS_RETRY_DAYS = 3;

export interface CachedSetlist {
  setlist: SFMFullSetlist | null;
  cached: boolean;
}

/**
 * Setlist for a past event, cached forever on a hit.
 *
 * This is the only provider call that used to happen on a page render, and
 * setlist.fm is the strictest limit we deal with — it answers 403 rather than
 * 429 when throttled. Every view of an archived event used to hit it.
 */
export async function getCachedSetlist(
  eventId: string,
  artistName: string,
  startsAt: string,
  timezone: string | null,
): Promise<CachedSetlist> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from('event_setlists')
    .select('found, payload, recheck_after')
    .eq('event_id', eventId)
    .maybeSingle();

  if (row) {
    if (row.found) return { setlist: row.payload as SFMFullSetlist, cached: true };
    // A cached miss is still authoritative until its retry window opens.
    if (row.recheck_after && new Date(row.recheck_after) > new Date()) {
      return { setlist: null, cached: true };
    }
  }

  let fetched: SFMFullSetlist | null = null;
  try {
    fetched = await getSetlistForEvent(artistName, startsAt, timezone);
  } catch {
    // Provider trouble should not break the page, and should not be cached as
    // a definitive miss either — leave any existing row alone.
    return { setlist: null, cached: false };
  }

  const recheckAfter = fetched
    ? null
    : new Date(Date.now() + SETLIST_MISS_RETRY_DAYS * 86_400_000).toISOString();

  await admin.from('event_setlists').upsert(
    {
      event_id: eventId,
      found: !!fetched,
      payload: fetched,
      setlistfm_url: fetched?.url ?? null,
      song_count: fetched ? countSongs(fetched) : 0,
      fetched_at: new Date().toISOString(),
      recheck_after: recheckAfter,
    },
    { onConflict: 'event_id' },
  );

  return { setlist: fetched, cached: false };
}

// ---------------------------------------------------------------- search

/** Normalised so trivially different queries share a cache entry. */
export function searchCacheKey(parts: {
  provider: string;
  q?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  page?: number;
}): string {
  const q = (parts.q ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  // Round coordinates to ~1km so two people in the same neighbourhood share a
  // cache entry instead of each triggering their own upstream call.
  const geo =
    parts.lat !== undefined && parts.lng !== undefined
      ? `${parts.lat.toFixed(2)},${parts.lng.toFixed(2)},${parts.radius ?? 50}`
      : '';
  return `${parts.provider}|${q}|${geo}|p${parts.page ?? 1}`;
}

export async function readSearchCache<T>(key: string): Promise<T | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('search_cache')
    .select('payload, expires_at')
    .eq('cache_key', key)
    .maybeSingle();

  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.payload as T;
}

export async function writeSearchCache(key: string, payload: unknown, ttlSeconds = 300) {
  const admin = createAdminClient();
  await admin.from('search_cache').upsert(
    {
      cache_key: key,
      payload,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    },
    { onConflict: 'cache_key' },
  );
}

/**
 * Drop expired rows. Called opportunistically from the search route rather than
 * on a schedule — the table is small and this keeps it from needing its own cron.
 */
export async function pruneSearchCache() {
  const admin = createAdminClient();
  await admin.from('search_cache').delete().lt('expires_at', new Date().toISOString());
}

// ---------------------------------------------------------------- geocoding

/**
 * A city does not move, so a hit is good effectively forever. A miss is worth
 * retrying sooner — usually it means a typo the user is still fixing, and
 * caching "San Francisc" as permanently unresolvable helps nobody.
 */
const GEOCODE_HIT_TTL_SECONDS = 30 * 86_400;
const GEOCODE_MISS_TTL_SECONDS = 3_600;

/**
 * Geocode a place name, cached in `search_cache` alongside search responses.
 *
 * The payload is wrapped in an object rather than stored bare, so a cached
 * *miss* (`{ place: null }`) is distinguishable from a cache miss (`null`) —
 * without that, every unresolvable query would re-hit a geocoder that allows
 * one request per second.
 */
export async function geocodePlace(query: string): Promise<Place | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const key = searchCacheKey({ provider: 'geocode', q });
  const cached = await readSearchCache<{ place: Place | null }>(key);
  if (cached) return cached.place;

  const place = await geocode(q);
  await writeSearchCache(
    key,
    { place },
    place ? GEOCODE_HIT_TTL_SECONDS : GEOCODE_MISS_TTL_SECONDS,
  );
  return place;
}

// ------------------------------------------------- spotify concerts (RapidAPI)

/**
 * Six hours, which is far longer than the 5 minutes search responses get.
 *
 * Two reasons. A tour schedule changes on the order of days, not minutes. And
 * the free plan allows **1000 requests a month** — roughly 33 a day across every
 * user — so this is the one provider where the cache is a budget control rather
 * than a latency optimisation.
 */
const SPOTIFY_CONCERTS_TTL_SECONDS = 6 * 3_600;

/**
 * An artist's concerts, cached.
 *
 * Returns null rather than throwing so callers degrade to JamBase on an outage
 * or an exhausted quota. The whole response is cached, so the "Add" action can
 * re-resolve a concert by id without spending a request.
 */
export async function cachedArtistConcerts(query: string): Promise<ArtistConcerts | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const key = searchCacheKey({ provider: 'spotifyconcerts', q });
  const cached = await readSearchCache<ArtistConcerts>(key);
  if (cached) return cached;

  try {
    const result = await searchArtistConcerts(q);
    await writeSearchCache(key, result, SPOTIFY_CONCERTS_TTL_SECONDS);
    return result;
  } catch (err) {
    console.error('spotify concerts lookup failed', err);
    return null;
  }
}
