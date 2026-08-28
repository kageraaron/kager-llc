import type { ParsedTicket } from '@/lib/types';

/**
 * Ticketmaster Discovery API v2.
 * Free tier: 5000 calls/day, 5 requests/second. Best US coverage of the free options.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

const BASE = 'https://app.ticketmaster.com/discovery/v2';

export interface TMEvent {
  id: string;
  name: string;
  url?: string;
  images?: { url: string; width: number; ratio?: string }[];
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  _embedded?: {
    venues?: TMVenue[];
    attractions?: TMAttraction[];
  };
}

export interface TMVenue {
  id: string;
  name: string;
  city?: { name?: string };
  state?: { stateCode?: string; name?: string };
  country?: { countryCode?: string };
  location?: { latitude?: string; longitude?: string };
  timezone?: string;
}

export interface TMAttraction {
  id: string;
  name: string;
  images?: { url: string; width: number }[];
  classifications?: { genre?: { name?: string }; subGenre?: { name?: string } }[];
  externalLinks?: { musicbrainz?: { id: string }[] };
}

function apiKey(): string {
  const k = process.env.TICKETMASTER_API_KEY;
  if (!k) throw new Error('TICKETMASTER_API_KEY is not set');
  return k;
}

async function tmFetch<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('apikey', apiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (res.status === 429) throw new Error('Ticketmaster rate limit hit (5 req/s, 5000/day)');
  if (!res.ok) throw new Error(`Ticketmaster ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Best image at or above a target width, else the widest available. */
export function pickImage(images?: { url: string; width: number }[], minWidth = 640): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => a.width - b.width);
  return (sorted.find((i) => i.width >= minWidth) ?? sorted[sorted.length - 1]).url;
}

export async function searchAttractions(keyword: string, size = 20): Promise<TMAttraction[]> {
  const data = await tmFetch<{ _embedded?: { attractions?: TMAttraction[] } }>(
    '/attractions.json',
    { keyword, size, classificationName: 'music' },
  );
  return data._embedded?.attractions ?? [];
}

export async function getAttractionEvents(attractionId: string, size = 50): Promise<TMEvent[]> {
  const data = await tmFetch<{ _embedded?: { events?: TMEvent[] } }>('/events.json', {
    attractionId,
    size,
    sort: 'date,asc',
  });
  return data._embedded?.events ?? [];
}

export interface EventSearchOpts {
  keyword?: string;
  city?: string;
  latlong?: string;
  radius?: number;
  startDateTime?: string;
  endDateTime?: string;
  size?: number;
}

export async function searchEvents(opts: EventSearchOpts): Promise<TMEvent[]> {
  const data = await tmFetch<{ _embedded?: { events?: TMEvent[] } }>('/events.json', {
    keyword: opts.keyword,
    city: opts.city,
    latlong: opts.latlong,
    radius: opts.radius,
    unit: opts.radius ? 'miles' : undefined,
    startDateTime: opts.startDateTime,
    endDateTime: opts.endDateTime,
    size: opts.size ?? 40,
    sort: opts.latlong ? 'date,asc' : 'date,asc',
    classificationName: 'music',
    segmentName: 'Music',
  });
  return data._embedded?.events ?? [];
}

export async function getEvent(id: string): Promise<TMEvent | null> {
  try {
    return await tmFetch<TMEvent>(`/events/${encodeURIComponent(id)}.json`, {});
  } catch {
    return null;
  }
}

/**
 * Find candidate events for a ticket parsed out of an email. Narrow by whatever
 * the email gave us; the caller scores the results.
 */
export async function findCandidatesForTicket(ticket: ParsedTicket): Promise<TMEvent[]> {
  if (ticket.tmEventId) {
    const direct = await getEvent(ticket.tmEventId);
    if (direct) return [direct];
  }

  const keyword = ticket.artistName ?? ticket.eventName;
  if (!keyword && !ticket.venueName) return [];

  // Give the date a +/- 2 day window: emails often carry a local date with no zone.
  let startDateTime: string | undefined;
  let endDateTime: string | undefined;
  if (ticket.startsAt) {
    const t = new Date(ticket.startsAt).getTime();
    if (!Number.isNaN(t)) {
      const day = 86_400_000;
      startDateTime = new Date(t - 2 * day).toISOString().replace(/\.\d{3}Z$/, 'Z');
      endDateTime = new Date(t + 2 * day).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
  }

  return searchEvents({
    keyword: keyword ?? ticket.venueName,
    city: ticket.city,
    startDateTime,
    endDateTime,
    size: 40,
  });
}
