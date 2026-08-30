/**
 * Eventbrite, via its official v3 API.
 *
 * This is the best-value provider in the app, and it is worth being precise
 * about why: it is the only source here that is *first-party to the ticket*.
 * When an Eventbrite confirmation lands in the inbox, we are not guessing which
 * real-world show it refers to — the email carries the event id, and this asks
 * Eventbrite directly.
 *
 * ## What it fixes that nothing else could
 *
 * The Silva Bumpa / Monarch booking (TODO §5.7.2) went wrong because the
 * matcher had to fall through to a Spotify proxy that reports no timezone and a
 * localized title. Eventbrite answers the same question authoritatively:
 *
 *   name      Silva Bumpa                    (not "Silva Bumpa y Dean Turnley")
 *   start     2026-09-27T22:00:00 local
 *   timezone  America/Los_Angeles            (a real IANA zone)
 *   venue     Monarch, San Francisco, CA, with coordinates
 *   logo      a real event image
 *
 * Even the JSON-LD in the confirmation email cannot match that: its `startDate`
 * is `"2026-09-27 22:00:00"` with no zone at all.
 *
 * ## BILLING — free, and generous
 *
 * | Provider | Allowance |
 * |---|---|
 * | Ticketmaster | 5,000/day |
 * | **Eventbrite** | **2,000/hour** (measured from `x-rate-limit`) |
 * | JamBase | trial quota |
 * | Spotify (RapidAPI) | 1,000/month |
 * | Bandsintown (Parse) | ~200 credits total |
 *
 * So it goes FIRST in the cascade — but only ever fires when the email handed
 * us an event id, so it costs nothing on tickets from other vendors.
 *
 * ## What it cannot do
 *
 * **Public event search is gone.** `/v3/events/search/` returns 404 — Eventbrite
 * withdrew it years ago. This provider can only answer "what is event 12345?",
 * never "what is on near me". That is why it is not wired into Browse.
 */

import type { ParsedTicket } from '@/lib/types';

const BASE = 'https://www.eventbriteapi.com/v3';

export function isConfigured(): boolean {
  return !!process.env.EVENTBRITE_API_KEY;
}

// ---------------------------------------------------------------- raw shapes

interface RawEvent {
  id?: string;
  name?: { text?: string };
  description?: { text?: string };
  url?: string;
  start?: { local?: string; utc?: string; timezone?: string };
  end?: { local?: string; utc?: string; timezone?: string };
  status?: string;
  online_event?: boolean;
  logo?: { original?: { url?: string }; url?: string };
  venue?: {
    id?: string;
    name?: string;
    address?: {
      city?: string;
      region?: string;
      country?: string;
      latitude?: string;
      longitude?: string;
    };
  } | null;
}

// ---------------------------------------------------------------- our shape

export interface EBEvent {
  /** Numeric Eventbrite event id, as a string. */
  id: string;
  name: string;
  /** A real instant. Eventbrite gives both UTC and local plus the zone. */
  startsAt: string;
  /** IANA zone — the field that makes this provider worth having. */
  timezone: string | null;
  venueName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  imageUrl: string | null;
  status: string;
  isOnline: boolean;
}

/**
 * Pull an Eventbrite event id out of a confirmation email.
 *
 * Real links take a few shapes, all ending in the numeric id:
 *
 *   https://www.eventbrite.com/e/silva-bumpa-tickets-1998116550390
 *   https://www.eventbrite.com/e/1998116550390
 *   https://www.eventbrite.co.uk/e/some-show-tickets-123456789012?aff=ebdssbdestsearch
 *
 * The id is the trailing run of digits, which is why the slug is matched
 * non-greedily up to the last hyphen rather than assumed absent.
 *
 * Marketing mail from the same sender also carries `/e/` links, so a hit here
 * is not on its own proof of a purchase — the vendor extractor still has to
 * decide the message is a confirmation.
 */
const EVENT_URL = /eventbrite\.[a-z.]{2,10}\/e\/(?:[^/?#\s"']*?-)?(\d{6,})/i;

export function eventIdFromText(text: string): string | undefined {
  const direct = EVENT_URL.exec(text);
  if (direct) return direct[1];

  /*
   * Bulk senders wrap every link in a click tracker, so the real URL survives
   * only percent-encoded inside a redirect parameter. Decoding the whole
   * document is cheap and finds those.
   */
  try {
    const decoded = decodeURIComponent(text.replace(/\+/g, ' '));
    return EVENT_URL.exec(decoded)?.[1];
  } catch {
    // A malformed escape sequence anywhere would throw; not worth caring about.
    return undefined;
  }
}

/** Pure: raw payload → our shape, or null without an id or a usable start. */
export function normalizeEvent(raw: RawEvent): EBEvent | null {
  const id = raw.id;
  const startsAt = raw.start?.utc ?? raw.start?.local;
  if (!id || !startsAt) return null;

  const addr = raw.venue?.address ?? {};
  const num = (v?: string) => {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id,
    name: raw.name?.text?.trim() || 'Untitled',
    // `utc` is already an instant; `local` is wall time and is only a fallback.
    startsAt: raw.start?.utc ?? `${raw.start?.local}Z`,
    timezone: raw.start?.timezone ?? null,
    venueName: raw.venue?.name ?? null,
    city: addr.city ?? null,
    region: addr.region ?? null,
    country: addr.country ?? null,
    lat: num(addr.latitude),
    lng: num(addr.longitude),
    url: raw.url ?? null,
    imageUrl: raw.logo?.original?.url ?? raw.logo?.url ?? null,
    status: raw.status ?? 'live',
    isOnline: !!raw.online_event,
  };
}

// ---------------------------------------------------------------- the call

async function call<T>(path: string): Promise<T> {
  const key = process.env.EVENTBRITE_API_KEY;
  if (!key) throw new Error('EVENTBRITE_API_KEY is not set');

  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    // Event details barely change; an hour is conservative.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Eventbrite ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

/**
 * One event by id. Returns null rather than throwing for the ordinary misses —
 * an id scraped out of marketing mail, or a private event we cannot see — so a
 * caller walking a cascade is not forced to distinguish them.
 *
 * `expand=venue` is not optional: without it `venue` is a bare id string and
 * there is no address, which is most of the value.
 */
export async function getEvent(eventId: string): Promise<EBEvent | null> {
  if (!isConfigured()) return null;

  try {
    const raw = await call<RawEvent>(`/events/${encodeURIComponent(eventId)}/?expand=venue`);
    return normalizeEvent(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 404 is expected often enough that it is not worth an error-level log.
    if (!/\b404\b/.test(message)) console.error('Eventbrite lookup failed', { eventId, message });
    return null;
  }
}

/** The Eventbrite event id a ticket points at, if it carries one. */
export function eventIdForTicket(ticket: ParsedTicket): string | null {
  return ticket.ebEventId ?? null;
}
