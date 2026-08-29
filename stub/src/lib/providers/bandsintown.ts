/**
 * Bandsintown, read through a Parse-generated API.
 *
 * Bandsintown has no public API any more — the old `rest.bandsintown.com` app-id
 * scheme is closed to new registrations. Parse (parse.bot) wraps the public site
 * and serves it as a normal REST API, which is how we get at it. Calls are
 * billed in Parse **credits**, not requests.
 *
 * ## Why it earns a place alongside three existing providers
 *
 * It is the most accurate source here for the case Stub keeps failing on. The
 * canonical example, verified live:
 *
 *   `get_artist_events_by_name("Overmono")` returns **Overmono @ Public Works,
 *   San Francisco, 2026-09-27** — the club show that is absent from BOTH
 *   Ticketmaster and JamBase, and which motivated manual entry (TODO §5.7).
 *
 * It gets the whole tour for **one credit**, and it carries two fields nothing
 * else here has:
 *
 *  - a real **IANA timezone** (`America/Los_Angeles`), where the Spotify proxy
 *    gives only a UTC offset that cannot be turned into a zone;
 *  - a genuine **past-events** endpoint, so the Archive tab can be backfilled
 *    from a tour history rather than only from setlist.fm.
 *
 * ## BILLING — read before adding a call site
 *
 * This is by a wide margin the SCARCEST provider in the app. Measured from the
 * live account on 2026-08-29:
 *
 * | Provider              | Allowance                    | Per artist query |
 * |-----------------------|------------------------------|------------------|
 * | Ticketmaster          | 5,000/day                    | free in practice |
 * | JamBase               | 14-day trial quota           | metered          |
 * | Spotify (RapidAPI)    | 1,000/month (~33/day)        | 1 request        |
 * | **Bandsintown/Parse** | **~200 credits, 99/day cap** | **1 credit**     |
 *
 * Two orders of magnitude below Ticketmaster and roughly 5x below Spotify. So:
 *
 *  - It is **last** in the ingestion cascade (`ingest/match.ts`) — reached only
 *    when a real ticket matched nothing cheaper. That is precisely the
 *    small-venue case it wins, and the volume there is low (one call per
 *    unmatched confirmation email, not per keystroke).
 *  - It is **never** on the Browse keystroke path. Browse reaches it only behind
 *    an explicit user action.
 *  - Every call goes through `lib/cache.ts`, at a 24-hour TTL — the longest of
 *    any provider here.
 *  - Every call is metered through `spendCredits` so the budget cannot be
 *    silently drained by a loop.
 *
 * ## Two endpoints that do NOT work as documented — verified live
 *
 * 1. **`country` / `region` filters on the artist endpoints are broken.**
 *    `get_artist_events_by_name("Overmono", country: "US")` returns an EMPTY
 *    events array, while the same call with no filter returns the US dates
 *    (Hollywood Palladium, Public Works, Cermak Hall, Terminal 5). Never pass
 *    them — fetch worldwide and filter locally in `inCountry` / `nearCity`.
 *
 * 2. **`get_city_events` ignores `start_date` and `end_date`.** Asking for
 *    2026-09-26..2026-09-28 returned events dated 2026-08-29 (i.e. today's,
 *    unfiltered). It is also metro-wide with no radius control — a
 *    "san-francisco-ca" page returns San Jose, Napa and Petaluma — pages only
 *    ~10 rows, and costs **3 credits** a page.
 *
 *    That combination makes it strictly worse than JamBase for "what's on near
 *    me", so it is deliberately NOT wired in. Bandsintown is an artist-query
 *    and event-detail provider here, nothing else.
 */

import type { ParsedTicket } from '@/lib/types';

const BASE = 'https://api.parse.bot/scraper';

/**
 * The canonical Parse scraper for bandsintown.com.
 *
 * Overridable so a private fork (a `parse` variant with its own id) can be
 * swapped in without a code change. The canonical id is shared and follows the
 * live listing; `BANDSINTOWN_API_VERSION` pins a release snapshot against it.
 */
function scraperId(): string {
  return process.env.BANDSINTOWN_SCRAPER_ID || '25ccb7dd-ea12-4f2c-bb0a-966dbe1228e3';
}

export function isConfigured(): boolean {
  return !!process.env.PARSE_API_KEY;
}

/** Credit cost per endpoint, from the marketplace listing. Used by the ledger. */
export const CREDIT_COST = {
  get_artist_events_by_name: 1,
  get_artist_events: 1,
  get_artist_past_events: 1,
  get_event_details: 1,
  search_artists: 3,
  get_city_events: 3,
} as const;

export type BITEndpoint = keyof typeof CREDIT_COST;

// ---------------------------------------------------------------- raw shapes

interface RawArtistEvent {
  title?: string | null;
  artist_name?: string | null;
  venue_name?: string | null;
  city?: string | null;
  /** Always null on the artist endpoints in practice — do not rely on it. */
  country?: string | null;
  /** Naive local wall time, no zone: `2026-09-27T22:00:00`. */
  starts_at?: string | null;
  event_url?: string | null;
  ticket_url?: string | null;
  lineup?: { id?: number; name?: string }[] | null;
}

interface RawArtistResponse {
  status?: string;
  data?: {
    id?: number;
    name?: string;
    verified?: boolean;
    image_url?: string | null;
    follower_count?: number | null;
    artist_slug?: string;
    artist_id?: number;
    events?: RawArtistEvent[];
  } | null;
}

interface RawEventDetails {
  status?: string;
  data?: {
    id?: number;
    title?: string | null;
    artist_id?: number;
    artist_name?: string;
    image_url?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    /** Real IANA zone — the reason this endpoint exists for us. */
    timezone?: string | null;
    rsvp_count?: number;
    ticket_url?: string | null;
    custom_ticket_url?: string | null;
    venue?: {
      name?: string;
      city?: string;
      address?: string;
      addressMultiline?: string[];
      url?: string;
    } | null;
    lineup?: { id?: number; name?: string }[] | null;
  } | null;
}

// ---------------------------------------------------------------- our shapes

export interface BITArtist {
  /** Numeric Bandsintown artist id. */
  id: string;
  name: string;
  /** `id-name` slug, the key for every other artist endpoint. */
  slug: string;
  imageUrl: string | null;
  followerCount: number | null;
}

export interface BITEvent {
  /** Numeric Bandsintown event id, parsed out of the event URL. */
  id: string;
  name: string;
  artistName: string | null;
  /**
   * Local wall time, NOT an instant.
   *
   * The artist endpoints give `2026-09-27T22:00:00` with no zone. Parsing that
   * as UTC would put a 22:00 San Francisco show at 15:00 the same day, so it is
   * kept as a naive string and only resolved once a zone is known — from
   * `get_event_details`, or from a venue row another provider already placed.
   */
  startsAtLocal: string;
  venueName: string | null;
  city: string | null;
  /** Only ever set from `get_event_details`; null on list rows. */
  timezone: string | null;
  ticketUrl: string | null;
  eventUrl: string | null;
  /** Co-billed artists. Empty on list rows, populated on detail rows. */
  lineup: string[];
}

export interface ArtistEvents {
  artist: BITArtist | null;
  events: BITEvent[];
  /** Credits left on the account, from the response envelope. Null if absent. */
  creditsRemaining: number | null;
}

// ---------------------------------------------------------------- the call

/** Parse wraps every response in an envelope; the payload is `result.data`. */
interface ParseEnvelope<T> {
  ok?: boolean;
  result?: { data?: T } | null;
  error?: { code?: string; message?: string; retry_after?: number } | null;
  meta?: { credits_remaining?: number; credits_charged?: number } | null;
}

export class BandsintownQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BandsintownQuotaError';
  }
}

async function call<T>(
  endpoint: BITEndpoint,
  params: Record<string, string | number | undefined>,
): Promise<{ data: T; creditsRemaining: number | null }> {
  const key = process.env.PARSE_API_KEY;
  if (!key) throw new Error('PARSE_API_KEY is not set');

  const url = new URL(`${BASE}/${scraperId()}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  // Pin a release snapshot. The canonical scraper follows the live listing, so
  // without this a marketplace update could change the response shape under us.
  const version = process.env.BANDSINTOWN_API_VERSION;
  if (version) url.searchParams.set('version', version);

  const res = await fetch(url, {
    headers: { 'X-API-Key': key, Accept: 'application/json' },
    // Next's own fetch cache is a second line of defence only. The real budget
    // control is the Postgres cache in lib/cache.ts, which is shared across
    // users and survives a cold function.
    next: { revalidate: 3600 },
  });

  if (res.status === 429) {
    throw new BandsintownQuotaError('Bandsintown/Parse rate limit or daily cap reached');
  }
  if (!res.ok) {
    throw new Error(`Bandsintown ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as ParseEnvelope<T>;
  const creditsRemaining = body.meta?.credits_remaining ?? null;

  // Parse reports tool-level failure in the body with a 200, so check both.
  if (body.ok === false || !body.result) {
    const code = body.error?.code ?? '';
    const message = body.error?.message ?? 'unknown error';
    if (code.includes('quota') || code.includes('credit')) {
      throw new BandsintownQuotaError(`Bandsintown credits exhausted: ${message}`);
    }
    throw new Error(`Bandsintown ${endpoint} failed: ${message}`);
  }

  if (creditsRemaining !== null && creditsRemaining < 25) {
    // The failure mode is a silent degrade, so this wants to be noisy early.
    console.warn(`Bandsintown credits low: ${creditsRemaining} left`);
  }

  return { data: (body.result.data ?? {}) as T, creditsRemaining };
}

// ---------------------------------------------------------------- normalizing

/**
 * `https://www.bandsintown.com/e/1040000560-overmono-at-public-works?...` →
 * `1040000560`.
 *
 * The list rows carry no bare id — only the URL — while `get_event_details`
 * wants the id (or the full `id-slug`). This is the only bridge between them.
 */
export function eventIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/(?:e|z)\/(\d+)/.exec(url);
  return m ? m[1] : null;
}

/** `{ id: 5399707, name: "Overmono" }` → `5399707-overmono`. */
export function artistSlug(id: number | string, name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${id}-${s}`;
}

/** Pure: raw row → our shape, or null without an id or a usable start. */
export function normalizeEvent(raw: RawArtistEvent): BITEvent | null {
  const id = eventIdFromUrl(raw.event_url) ?? eventIdFromUrl(raw.ticket_url);
  const startsAtLocal = raw.starts_at ?? null;
  if (!id || !startsAtLocal) return null;

  // `title` is "Overmono @ Public Works" on ordinary shows and a real festival
  // name ("Rock The Gates 2026") on festival rows. Either way it beats a null.
  const name = raw.title ?? raw.artist_name ?? 'Untitled';

  return {
    id,
    name,
    artistName: raw.artist_name ?? null,
    startsAtLocal,
    venueName: raw.venue_name ?? null,
    city: raw.city ?? null,
    timezone: null,
    ticketUrl: raw.ticket_url ?? null,
    eventUrl: raw.event_url ?? null,
    lineup: (raw.lineup ?? []).map((l) => l.name).filter((n): n is string => !!n),
  };
}

/**
 * Does the artist Bandsintown picked plausibly answer the query?
 *
 * `get_artist_events_by_name` resolves internally by "best match" and, like the
 * Spotify proxy, has no relevance floor — it will confidently answer with
 * *something*. Same guard as `spotifyconcerts.matchesQuery`, and the same
 * reasoning: forward prefix matching is the good case ("Chris L" → Chris Lake),
 * the reverse direction is where the nonsense lives.
 */
export function matchesQuery(query: string, artistName: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = norm(query);
  const a = norm(artistName);
  if (!q || !a) return false;
  if (a.startsWith(q)) return true;
  return q.startsWith(a) && q.length - a.length <= 3;
}

/**
 * Resolve a naive local wall time against a zone.
 *
 * `2026-09-27T22:00:00` + `America/Los_Angeles` → `2026-09-28T05:00:00.000Z`.
 * With no zone we cannot honestly produce an instant, so the caller gets null
 * and decides — `upsertBandsintownEvent` anchors it as UTC and leaves
 * `timezone` null, which is what the Spotify path already does.
 */
export function toInstant(local: string, timezone: string | null): string | null {
  if (!timezone) return null;
  const naive = new Date(`${local.replace(/Z$/, '')}Z`);
  if (Number.isNaN(naive.getTime())) return null;

  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asLocal = new Date(naive.toLocaleString('en-US', { timeZone: timezone }));
  return new Date(naive.getTime() + (asUtc.getTime() - asLocal.getTime())).toISOString();
}

// ---------------------------------------------------------------- endpoints

/**
 * An artist's upcoming tour, resolved from a free-text name. **1 credit.**
 *
 * One call does search + profile + events. `search_artists` costs 3 credits for
 * strictly less, so it is not wrapped at all — there is no case where paying
 * triple to resolve a name separately is the right move.
 *
 * Deliberately fetches worldwide: the `country` filter is broken upstream (see
 * the header note), and the whole tour is the same one credit, so narrowing
 * happens locally in `nearCity`.
 */
export async function getArtistEvents(query: string): Promise<ArtistEvents> {
  const { data, creditsRemaining } = await call<RawArtistResponse['data']>(
    'get_artist_events_by_name',
    { artist_name: query },
  );

  if (!data?.name) return { artist: null, events: [], creditsRemaining };

  // A fuzzy miss is reported as no artist rather than a confident wrong answer.
  if (!matchesQuery(query, data.name)) {
    return { artist: null, events: [], creditsRemaining };
  }

  const id = data.artist_id ?? data.id;
  const artist: BITArtist | null =
    id !== undefined
      ? {
          id: String(id),
          name: data.name,
          slug: data.artist_slug ?? artistSlug(id, data.name),
          imageUrl: data.image_url ?? null,
          followerCount: data.follower_count ?? null,
        }
      : null;

  const events = (data.events ?? [])
    .map(normalizeEvent)
    .filter((e): e is BITEvent => e !== null);

  return { artist, events, creditsRemaining };
}

/**
 * An artist's PAST shows. **1 credit.**
 *
 * No other provider here does this. Ticketmaster and JamBase list what is on
 * sale; the Spotify proxy returns upcoming dates only; setlist.fm has setlists
 * but you must already know the show happened. This is the one source that can
 * answer "what did they play near me in 2024", which is what the Archive tab
 * wants for backfill.
 *
 * Rows use a different key set from the upcoming ones (`venue_name` + `city` +
 * a `title` that is often the VENUE name rather than the show), so they are
 * normalised here rather than through `normalizeEvent`.
 */
export async function getArtistPastEvents(slug: string): Promise<BITEvent[]> {
  interface RawPast {
    events?: {
      id?: number;
      title?: string | null;
      starts_at?: string | null;
      venue_name?: string | null;
      city?: string | null;
      country?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      ticket_url?: string | null;
      event_url?: string | null;
      lineup?: { name?: string }[] | null;
    }[];
    total_events?: number;
  }

  const { data } = await call<RawPast>('get_artist_past_events', { artist: slug });

  return (data.events ?? [])
    .map((raw): BITEvent | null => {
      const id = raw.id !== undefined ? String(raw.id) : eventIdFromUrl(raw.event_url);
      if (!id || !raw.starts_at) return null;
      return {
        id,
        // On past rows `title` is frequently the venue ("Barclays Arena"), so
        // it is not trusted as the event name when a venue is also present.
        name: raw.venue_name && raw.title === raw.venue_name ? raw.venue_name : raw.title ?? 'Untitled',
        artistName: null,
        startsAtLocal: raw.starts_at,
        venueName: raw.venue_name ?? null,
        city: raw.city ?? null,
        timezone: null,
        ticketUrl: raw.ticket_url ?? null,
        eventUrl: raw.event_url ?? null,
        lineup: (raw.lineup ?? []).map((l) => l.name).filter((n): n is string => !!n),
      };
    })
    .filter((e): e is BITEvent => e !== null);
}

export interface BITEventDetails extends BITEvent {
  venueAddress: string | null;
  rsvpCount: number | null;
  imageUrl: string | null;
}

/**
 * Full detail for one event. **1 credit.**
 *
 * This is the enrichment call, and the only one that returns an IANA
 * `timezone`, a street address, and a resolved `ticket_url` that points at the
 * vendor rather than back at Bandsintown. Called on demand for a single saved
 * event, never in a loop over search results.
 */
export async function getEventDetails(eventId: string): Promise<BITEventDetails | null> {
  const { data } = await call<RawEventDetails['data']>('get_event_details', { event: eventId });
  if (!data?.id) return null;

  const venue = data.venue ?? null;
  return {
    id: String(data.id),
    name: data.title ?? (venue?.name ? `${data.artist_name} @ ${venue.name}` : data.artist_name ?? 'Untitled'),
    artistName: data.artist_name ?? null,
    startsAtLocal: data.starts_at ?? '',
    venueName: venue?.name ?? null,
    city: venue?.city ?? null,
    timezone: data.timezone ?? null,
    // `custom_ticket_url` is the vendor's own link when the promoter set one;
    // `ticket_url` falls back to a Bandsintown RSVP page and is often "".
    ticketUrl: data.custom_ticket_url || data.ticket_url || null,
    eventUrl: `https://www.bandsintown.com/e/${data.id}`,
    lineup: (data.lineup ?? []).map((l) => l.name).filter((n): n is string => !!n),
    venueAddress: venue?.address ?? null,
    rsvpCount: data.rsvp_count ?? null,
    imageUrl: data.image_url ?? null,
  };
}

// ---------------------------------------------------------------- local filters

/**
 * Narrow a worldwide tour to one city, by name.
 *
 * Note this is NOT the radius filter the Spotify path uses. Bandsintown's
 * artist rows carry no coordinates, so there is nothing to measure a distance
 * against — matching is on the city string, plus the metro aliases that matter
 * in practice. A caller wanting true radius filtering should use the Spotify
 * provider, which does carry lat/lng on every row.
 */
export function nearCity(events: BITEvent[], city: string): BITEvent[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(city);
  if (!want) return events;

  return events.filter((e) => {
    if (!e.city) return false;
    const got = norm(e.city);
    return got === want || got.includes(want) || want.includes(got);
  });
}

/** Candidate events for a parsed ticket, narrowed to its date window. */
export function withinDays(events: BITEvent[], iso: string, days: number): BITEvent[] {
  const want = new Date(iso).getTime();
  if (Number.isNaN(want)) return events;
  const slack = days * 86_400_000;

  return events.filter((e) => {
    // Compared as naive-vs-naive: the ticket's own date is usually local wall
    // time too, and the window is days wide, so a few hours of zone error is
    // absorbed rather than corrected with a zone we do not have.
    const got = new Date(`${e.startsAtLocal.replace(/Z$/, '')}Z`).getTime();
    return Number.isNaN(got) || Math.abs(want - got) <= slack;
  });
}

/** The artist name a ticket should be looked up under. */
export function queryForTicket(ticket: ParsedTicket): string | null {
  const q = ticket.artistName ?? ticket.eventName;
  return q && q.trim().length >= 2 ? q.trim() : null;
}
