/**
 * JamBase Data API v3.
 *
 * Why this exists alongside Ticketmaster: Ticketmaster only knows about events
 * it sells tickets to. JamBase aggregates ~60 sources, so it sees the club
 * circuit and — critically — FESTIVAL LINEUPS.
 *
 * The case that motivated it: "Overmono in San Francisco" returns nothing from
 * Ticketmaster (8 events worldwide, none in SF) because the SF date is a Portola
 * festival appearance Ticketmaster doesn't sell. JamBase returns it.
 *
 * BILLING: JamBase is a 14-day free trial, not a free tier. `isConfigured()`
 * lets every call site degrade to Ticketmaster if the key is absent or lapses.
 *
 * Responses are schema.org-shaped (@type / location / performer / offers).
 */

const BASE = 'https://api.data.jambase.com/v3';

export function isConfigured(): boolean {
  return !!process.env.JAMBASE_API_KEY;
}

function headers(): HeadersInit {
  const key = process.env.JAMBASE_API_KEY;
  if (!key) throw new Error('JAMBASE_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'User-Agent': 'Stub/0.1.0 (https://github.com/kageraaron)',
  };
}

interface JBAddress {
  streetAddress?: string;
  addressLocality?: string;
  postalCode?: string;
  addressRegion?: { name?: string; alternateName?: string };
  addressCountry?: { identifier?: string; name?: string };
  'x-timezone'?: string;
}

export interface JBVenue {
  name?: string;
  identifier?: string;
  url?: string;
  address?: JBAddress;
  geo?: { latitude?: number; longitude?: number };
}

export interface JBPerformer {
  '@type'?: string;
  name?: string;
  identifier?: string;
  image?: string;
  genre?: string[];
  url?: string;
  'x-performanceRole'?: string;
}

export interface JBEvent {
  '@type'?: string;
  name?: string;
  identifier?: string;
  url?: string;
  image?: string;
  eventStatus?: string;
  /** Date only ("2026-09-26") or full ISO, depending on the source. */
  startDate?: string;
  endDate?: string;
  doorTime?: string;
  location?: JBVenue;
  performer?: JBPerformer[];
  offers?: { name?: string; url?: string; category?: string }[];
}

interface JBResponse<T> {
  success?: boolean;
  pagination?: { totalItems?: number; page?: number; perPage?: number };
  events?: T[];
  artists?: T[];
  detail?: string;
}

async function jb<T>(path: string, params: Record<string, string | number | undefined>): Promise<JBResponse<T>> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: headers(), next: { revalidate: 300 } });
  const body = (await res.json()) as JBResponse<T>;

  if (!res.ok || body.success === false) {
    // JamBase reports parameter errors in the body with a 200, so check both.
    throw new Error(`JamBase ${res.status}: ${body.detail ?? JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

export interface JBSearchOpts {
  artistName?: string;
  /** Centre point for a radius search. Both required together. */
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  /** ISO date, inclusive. */
  startDate?: string;
  endDate?: string;
  page?: number;
  perPage?: number;
}

/**
 * Search events by artist, location, or both.
 *
 * Location is lat/lng + radius — `geoCityId` and `geoMetroId` are rejected by
 * the API despite appearing in some docs, so we always geocode to a point.
 */
export async function searchEvents(opts: JBSearchOpts): Promise<{ events: JBEvent[]; total: number }> {
  const hasGeo = opts.lat !== undefined && opts.lng !== undefined;

  const data = await jb<JBEvent>('/events', {
    artistName: opts.artistName,
    geoLatitude: hasGeo ? opts.lat : undefined,
    geoLongitude: hasGeo ? opts.lng : undefined,
    geoRadiusAmount: hasGeo ? (opts.radiusMiles ?? 50) : undefined,
    geoRadiusUnits: hasGeo ? 'mi' : undefined,
    eventDateFrom: opts.startDate,
    eventDateTo: opts.endDate,
    page: opts.page,
    perPage: opts.perPage ?? 40,
  });

  return { events: data.events ?? [], total: data.pagination?.totalItems ?? 0 };
}

export async function searchArtists(name: string, perPage = 10): Promise<JBPerformer[]> {
  const data = await jb<JBPerformer>('/artists', { artistName: name, perPage });
  return data.artists ?? [];
}

// ---------------------------------------------------------------- normalizing

/** Strip the `jambase:` prefix so ids are stable and comparable. */
export function jbId(identifier?: string): string | null {
  if (!identifier) return null;
  return identifier.replace(/^jambase:/, '') || null;
}

/**
 * JamBase gives a date-only `startDate` for many events (festivals especially).
 * Anchor those at 20:00 in the venue's timezone rather than midnight UTC, which
 * would otherwise show the show on the wrong day for US west-coast venues.
 */
export function resolveStart(event: JBEvent): string | null {
  const raw = event.startDate;
  if (!raw) return null;
  if (raw.includes('T')) return raw;

  const tz = event.location?.address?.['x-timezone'];
  if (!tz) return `${raw}T20:00:00Z`;

  // Build 20:00 local, then convert to an absolute instant.
  const naive = new Date(`${raw}T20:00:00Z`);
  const asIfUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asIfLocal = new Date(naive.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = asIfUtc.getTime() - asIfLocal.getTime();
  return new Date(naive.getTime() + offsetMs).toISOString();
}

/**
 * The billed act.
 *
 * `matching` biases toward the artist the user actually searched for. Without it
 * a festival returns an arbitrary lineup member — searching "Overmono" and
 * being shown "Robyn" because she happens to be first in Portola's lineup.
 *
 * For festivals with no match we return null rather than guessing: the festival
 * name is the meaningful label, not one of forty performers.
 */
export function headlinerOf(event: JBEvent, matching?: string): JBPerformer | null {
  const performers = event.performer ?? [];
  if (performers.length === 0) return null;

  if (matching) {
    const want = matching.toLowerCase().trim();
    const hit = performers.find((p) => (p.name ?? '').toLowerCase().trim() === want)
      ?? performers.find((p) => (p.name ?? '').toLowerCase().includes(want));
    if (hit) return hit;
  }

  const billed = performers.find((p) => p['x-performanceRole'] === 'headliner');
  if (billed) return billed;

  return isFestival(event) ? null : performers[0];
}

/** Best ticket link, preferring the primary vendor over resale. */
export function ticketUrl(event: JBEvent): string | null {
  const offers = event.offers ?? [];
  const primary = offers.find((o) => o.category === 'ticketingLinkPrimary');
  return primary?.url ?? offers[0]?.url ?? event.url ?? null;
}

export function isFestival(event: JBEvent): boolean {
  return event['@type'] === 'Festival';
}

/**
 * Fetch one event by its JamBase id (without the `jambase:` prefix).
 *
 * Uses the `?eventId=` query form rather than `/events/id/...`: both work, but
 * the path form returns a singular `event` key while this one returns the same
 * `events` array as every other call, so there is one shape to handle.
 */
export async function getEventById(id: string): Promise<JBEvent | null> {
  try {
    const data = await jb<JBEvent>('/events', { eventId: `jambase:${id}` });
    return (data.events ?? [])[0] ?? null;
  } catch {
    return null;
  }
}
