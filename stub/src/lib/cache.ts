import { createAdminClient } from '@/lib/supabase/admin';
import { getSetlistForEvent, countSongs, type SFMFullSetlist } from '@/lib/providers/setlistfm';
import { geocode, type Place } from '@/lib/providers/geocode';
import { searchArtistConcerts, type ArtistConcerts } from '@/lib/providers/spotifyconcerts';
import * as bandsintown from '@/lib/providers/bandsintown';

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

  /*
   * An EMPTY setlist is a miss, not a hit.
   *
   * setlist.fm has stub pages: someone creates the gig, nobody logs the songs.
   * A real KETTAMA show came back `{"sets":{"set":[]}}` with `found: true`,
   * which put a "Setlist" badge on the Archive card and then showed nothing
   * behind it. Worse, a hit is cached FOREVER — a past setlist does not change
   * — so the stub would have been permanent.
   *
   * Treating it as a miss both hides the badge and schedules a recheck, which
   * is right: songs get added to these pages late, and often.
   */
  const songs = fetched ? countSongs(fetched) : 0;
  const isHit = !!fetched && songs > 0;

  const recheckAfter = isHit
    ? null
    : new Date(Date.now() + SETLIST_MISS_RETRY_DAYS * 86_400_000).toISOString();

  await admin.from('event_setlists').upsert(
    {
      event_id: eventId,
      found: isHit,
      payload: fetched,
      setlistfm_url: fetched?.url ?? null,
      song_count: songs,
      fetched_at: new Date().toISOString(),
      recheck_after: recheckAfter,
    },
    { onConflict: 'event_id' },
  );

  return { setlist: isHit ? fetched : null, cached: false };
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

// ------------------------------------------------- bandsintown (via Parse)

/**
 * 24 hours — the longest TTL of any provider here, and deliberately so.
 *
 * Bandsintown is the scarcest source in the app (~200 credits total against a
 * 99/day cap, versus Spotify's 1000/month and Ticketmaster's 5000/day). A tour
 * schedule changes on the order of days, so a day-old answer is not meaningfully
 * worse, and at 1 credit a call the cache is the difference between the budget
 * lasting months and lasting an afternoon.
 */
const BANDSINTOWN_TTL_SECONDS = 24 * 3_600;

/** A miss is cached too, but briefly — a small artist may get added tomorrow. */
const BANDSINTOWN_MISS_TTL_SECONDS = 6 * 3_600;

/** Event detail is far more stable than a tour listing: venue and zone do not move. */
const BANDSINTOWN_DETAIL_TTL_SECONDS = 30 * 86_400;

/**
 * Two ceilings, because the quota is monthly but the risk is bursty.
 *
 * The Parse free tier is **200 credits per calendar month** (Hobby is 1,000 at
 * $30, Developer 5,000 at $100). That works out at ~6.6 credits a day, so:
 *
 *  - **Monthly is the real ceiling.** It is the quota. Defaults to 180 rather
 *    than 200, leaving ~10% headroom for the fact that Parse resets on its own
 *    clock and our month boundary is UTC — the two can disagree by hours.
 *
 *  - **Daily is a burst limiter**, not a budget. It exists so one runaway
 *    afternoon cannot consume the month in an hour. It is deliberately larger
 *    than 200/30: real usage is lumpy, and a hard 6/day would refuse the second
 *    genuine search of the evening while leaving the month underspent.
 *
 * Whichever binds first wins. The upstream 99/day cap is irrelevant at these
 * numbers — it would let you empty the whole month in two days.
 */
function dailyCreditCap(): number {
  const raw = Number(process.env.BANDSINTOWN_DAILY_CREDITS);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

function monthlyCreditCap(): number {
  const raw = Number(process.env.BANDSINTOWN_MONTHLY_CREDITS);
  return Number.isFinite(raw) && raw > 0 ? raw : 180;
}

/**
 * Credits already spent in the last 24 hours, from the ledger.
 *
 * Reads the rollup view rather than counting rows, so this stays one indexed
 * query no matter how long the log gets.
 *
 * Returns **null when the ledger cannot be read** — a missing view (the app
 * deployed ahead of migration `0014`), a permissions problem, an outage. That
 * is deliberately distinct from `0`: swallowing the error and answering "zero
 * spent" would make the budget guard pass unconditionally and spend blind
 * against a balance that does not refill. `null` means "unknown", and
 * `checkBudget` refuses on unknown.
 */
async function spendFromView(view: string, provider: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(view)
    .select('credits_spent')
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    console.error(`${view} unreadable — refusing to spend`, error.message);
    return null;
  }
  // No row simply means nothing has been spent in the window yet.
  return data?.credits_spent ?? 0;
}

export async function creditsSpentToday(provider = 'bandsintown'): Promise<number | null> {
  return spendFromView('provider_spend_today', provider);
}

/** Credits spent since the start of the current UTC calendar month. */
export async function creditsSpentThisMonth(provider = 'bandsintown'): Promise<number | null> {
  return spendFromView('provider_spend_month', provider);
}

/** Record a spend. Append-only; failures here must never fail the call itself. */
async function recordSpend(
  provider: string,
  endpoint: string,
  credits: number,
  remaining: number | null,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('provider_spend')
    .insert({ provider, endpoint, credits, remaining });
  if (error) console.error('provider_spend insert failed', error.message);
}

export interface BudgetVerdict {
  allowed: boolean;
  /** Null when the ledger could not be read — see `creditsSpentToday`. */
  spent: number | null;
  cap: number;
  spentMonth: number | null;
  capMonth: number;
  /** Which ceiling refused, for logging. Null when allowed. */
  boundBy: 'day' | 'month' | 'unknown' | null;
}

/**
 * May we spend `credits` against the daily budget right now?
 *
 * Checked BEFORE the call, because the upstream only reports the remaining
 * balance in the response — by which point the credit is already gone.
 *
 * This is advisory rather than transactional: two concurrent requests can both
 * pass a check that only one should. That is an accepted trade — the cap sits
 * well below the real ceiling precisely so a small overshoot is harmless, and
 * a lock here would serialise every search.
 *
 * It does, however, **fail closed**. An unreadable ledger means we do not know
 * what has been spent, and guessing "nothing" against a ~200-credit balance that
 * does not refill is the one genuinely expensive mistake available here. The
 * cost of refusing is that Bandsintown degrades to the other three providers,
 * which every call site already handles.
 */
/** Log-friendly reason a spend was refused — "23/25 credits" or "ledger unreadable". */
function budgetReason(v: BudgetVerdict): string {
  if (v.boundBy === 'unknown') return 'ledger unreadable';
  if (v.boundBy === 'month') return `monthly cap reached (${v.spentMonth}/${v.capMonth})`;
  if (v.boundBy === 'day') return `daily burst cap reached (${v.spent}/${v.cap} today)`;
  return `${v.spent}/${v.cap} today, ${v.spentMonth}/${v.capMonth} this month`;
}

export async function checkBudget(
  credits: number,
  provider = 'bandsintown',
): Promise<BudgetVerdict> {
  const cap = dailyCreditCap();
  const capMonth = monthlyCreditCap();

  // One round trip each; both views are indexed on (provider, spent_at).
  const [spent, spentMonth] = await Promise.all([
    creditsSpentToday(provider),
    creditsSpentThisMonth(provider),
  ]);

  const base = { spent, cap, spentMonth, capMonth };
  if (spent === null || spentMonth === null) {
    return { ...base, allowed: false, boundBy: 'unknown' };
  }
  // Monthly is checked first because it is the one that actually costs money to
  // exceed; the daily cap only shapes how fast the month is consumed.
  if (spentMonth + credits > capMonth) return { ...base, allowed: false, boundBy: 'month' };
  if (spent + credits > cap) return { ...base, allowed: false, boundBy: 'day' };
  return { ...base, allowed: true, boundBy: null };
}

/**
 * An artist's Bandsintown tour, cached and budgeted.
 *
 * Returns null on every failure path — an unconfigured key, an exhausted
 * budget, an upstream error, or an artist Bandsintown does not recognise — so
 * that callers degrade to the cheaper providers instead of surfacing an error.
 * The distinction between those cases is logged, not returned: no call site
 * behaves differently, they all just fall through.
 */
export async function cachedBandsintownArtist(
  query: string,
): Promise<bandsintown.ArtistEvents | null> {
  const q = query.trim();
  if (q.length < 2 || !bandsintown.isConfigured()) return null;

  const key = searchCacheKey({ provider: 'bandsintown', q });
  const cached = await readSearchCache<bandsintown.ArtistEvents>(key);
  if (cached) return cached;

  const cost = bandsintown.CREDIT_COST.get_artist_events_by_name;
  const budget = await checkBudget(cost);
  if (!budget.allowed) {
    console.warn(
      `Bandsintown artist lookup skipped: ${budgetReason(budget)}`,
    );
    return null;
  }

  try {
    const result = await bandsintown.getArtistEvents(q);
    await recordSpend('bandsintown', 'get_artist_events_by_name', cost, result.creditsRemaining);

    // A resolved artist with no dates is a real answer worth caching at full
    // TTL; an unresolved name is cached briefly in case they get listed later.
    await writeSearchCache(
      key,
      result,
      result.artist ? BANDSINTOWN_TTL_SECONDS : BANDSINTOWN_MISS_TTL_SECONDS,
    );
    return result;
  } catch (err) {
    // A quota error still consumed nothing, but must not be cached as a miss —
    // that would hide the artist for six hours after the budget resets.
    console.error('bandsintown artist lookup failed', err);
    return null;
  }
}

/**
 * Full detail for one Bandsintown event, cached for 30 days.
 *
 * This is the enrichment path: it is what supplies an IANA timezone and a real
 * vendor ticket URL for an event we have already decided to save. Called for a
 * single event on demand — never mapped over a result list, which would cost a
 * credit per row.
 */
export async function cachedBandsintownEvent(
  eventId: string,
): Promise<bandsintown.BITEventDetails | null> {
  if (!eventId || !bandsintown.isConfigured()) return null;

  const key = searchCacheKey({ provider: 'bandsintown-event', q: eventId });
  const cached = await readSearchCache<{ event: bandsintown.BITEventDetails | null }>(key);
  if (cached) return cached.event;

  const cost = bandsintown.CREDIT_COST.get_event_details;
  const budget = await checkBudget(cost);
  if (!budget.allowed) {
    console.warn(`Bandsintown detail skipped: ${budgetReason(budget)}`);
    return null;
  }

  try {
    const event = await bandsintown.getEventDetails(eventId);
    await recordSpend('bandsintown', 'get_event_details', cost, null);
    // Wrapped so a cached miss is distinguishable from a cache miss, same as
    // `geocodePlace`. Without it every unknown id re-spends a credit.
    await writeSearchCache(key, { event }, BANDSINTOWN_DETAIL_TTL_SECONDS);
    return event;
  } catch (err) {
    console.error('bandsintown event detail failed', err);
    return null;
  }
}

/**
 * An artist's PAST shows, for Archive backfill. Cached for 30 days.
 *
 * Tour history is append-only and the tail never changes, so this is the safest
 * long cache in the file. Takes an `id-name` slug, which comes from a prior
 * `cachedBandsintownArtist` call — resolving a name here would cost a second
 * credit for something the upcoming-events response already told us.
 */
export async function cachedBandsintownPastEvents(
  slug: string,
): Promise<bandsintown.BITEvent[] | null> {
  if (!slug || !bandsintown.isConfigured()) return null;

  const key = searchCacheKey({ provider: 'bandsintown-past', q: slug });
  const cached = await readSearchCache<{ events: bandsintown.BITEvent[] }>(key);
  if (cached) return cached.events;

  const cost = bandsintown.CREDIT_COST.get_artist_past_events;
  const budget = await checkBudget(cost);
  if (!budget.allowed) return null;

  try {
    const events = await bandsintown.getArtistPastEvents(slug);
    await recordSpend('bandsintown', 'get_artist_past_events', cost, null);
    await writeSearchCache(key, { events }, BANDSINTOWN_DETAIL_TTL_SECONDS);
    return events;
  } catch (err) {
    console.error('bandsintown past events failed', err);
    return null;
  }
}

/**
 * Per-user ceiling on deep searches, on top of the global budget.
 *
 * The global caps stop the deployment overspending; they do nothing about *who*
 * spent it. With 200 credits a month across the whole friend group, one person
 * repeatedly tapping "Search harder" can consume everyone else's allowance in a
 * sitting — and the failure is invisible to them, because a refused deep search
 * just falls back to the ordinary providers.
 *
 * The ledger already records every spend, so this is a count over the same
 * rows. `endpoint` is reused to carry the user id rather than adding a column:
 * a deep search is logged as `deep:<uuid>`, which keeps the guard to one indexed
 * query and leaves the plain `get_artist_events_by_name` rows (ingestion, which
 * is automatic and not attributable to a person's tapping) uncounted.
 */
const DEEP_SEARCHES_PER_USER_PER_DAY = 5;

export async function checkUserDeepSearchBudget(
  userId: string,
): Promise<{ allowed: boolean; used: number; cap: number }> {
  const cap = Number(process.env.BANDSINTOWN_DEEP_PER_USER) || DEEP_SEARCHES_PER_USER_PER_DAY;
  const admin = createAdminClient();

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await admin
    .from('provider_spend')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'bandsintown')
    .eq('endpoint', `deep:${userId}`)
    .gte('spent_at', since);

  // Fails closed, same reasoning as `checkBudget`.
  if (error) {
    console.error('deep search budget unreadable — refusing', error.message);
    return { allowed: false, used: 0, cap };
  }
  return { allowed: (count ?? 0) < cap, used: count ?? 0, cap };
}

/**
 * A deep search, attributed to the user who asked for it.
 *
 * Wraps `cachedBandsintownArtist` so the per-user counter only advances on a
 * genuine upstream spend. A cache hit is free and must not count against
 * anyone — otherwise searching the same artist twice would burn two of the
 * five, for one credit.
 */
export async function deepSearchForUser(
  userId: string,
  query: string,
): Promise<bandsintown.ArtistEvents | null> {
  const q = query.trim();
  if (q.length < 2 || !bandsintown.isConfigured()) return null;

  // A cached answer bypasses the per-user limit entirely — nothing is spent.
  const key = searchCacheKey({ provider: 'bandsintown', q });
  const cached = await readSearchCache<bandsintown.ArtistEvents>(key);
  if (cached) return cached;

  const budget = await checkUserDeepSearchBudget(userId);
  if (!budget.allowed) {
    console.warn(`deep search refused for ${userId}: ${budget.used}/${budget.cap} in 24h`);
    return null;
  }

  const result = await cachedBandsintownArtist(q);
  // Attribute the spend only if one actually happened. `cachedBandsintownArtist`
  // returns null when the global budget refused, in which case nothing was spent
  // and nothing should be charged to this user.
  if (result) {
    const admin = createAdminClient();
    const { error } = await admin.from('provider_spend').insert({
      provider: 'bandsintown',
      endpoint: `deep:${userId}`,
      // Zero credits: the real cost is already logged by
      // `cachedBandsintownArtist`. This row exists only to attribute the
      // action, and must not double-count against the global caps.
      credits: 0,
    });
    if (error) console.error('deep search attribution failed', error.message);
  }
  return result;
}
