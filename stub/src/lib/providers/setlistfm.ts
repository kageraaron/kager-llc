/**
 * setlist.fm — free for non-commercial use, key in the `x-api-key` header.
 *
 * Two jobs here, and the second matters more than it looks.
 *
 * **1. Seeding the Archive.** `/user/{userId}/attended` is the best free source
 * of a user's past concerts. Ticketmaster only knows what it sold.
 *
 * **2. Matching a PAST ticket.** Every listing provider in the cascade answers
 * "what is on sale", so a confirmation for a show that already happened matches
 * nothing anywhere and lands in the review queue. setlist.fm is a database of
 * shows that *definitely happened*, and `/search/setlists?artistName=&date=`
 * answers the exact question a past ticket asks.
 *
 * Measured against a real unmatched inbox on 2026-08-30 — 4 of 6 found, and the
 * two misses were small club nights:
 *
 * | Ticket | setlist.fm |
 * |---|---|
 * | Kaskade, 17 Apr 2026 | Pier 48, San Francisco |
 * | Chris Lake, 2 May 2026 | Pier 48, San Francisco |
 * | KETTAMA, 6 May 2026 | The Regency Ballroom, San Francisco |
 * | Chris Lorenzo, 19 Dec 2025 | Moscone Center, San Francisco |
 * | Shiba San, 8 May 2026 | — |
 * | Chris Stussy, 27 Feb 2026 | — |
 *
 * It goes ahead of Bandsintown's past-events endpoint for that job because it is
 * **free and better targeted**: one query for an exact artist+date, versus a
 * credit to resolve a slug plus another to pull fifty recent dates. That also
 * makes it the answer to JamBase's trial expiring — it is a permanent free
 * source rather than a countdown.
 */

const BASE = 'https://api.setlist.fm/rest/1.0';

function apiKey(): string {
  const k = process.env.SETLISTFM_API_KEY;
  if (!k) throw new Error('SETLISTFM_API_KEY is not set');
  return k;
}

export interface SFMSetlist {
  id: string;
  eventDate: string; // dd-MM-yyyy
  artist: { mbid: string; name: string };
  venue: {
    id: string;
    name: string;
    city?: {
      name?: string;
      state?: string;
      stateCode?: string;
      country?: { code?: string; name?: string };
      coords?: { lat?: number; long?: number };
    };
  };
  tour?: { name?: string };
  url?: string;
}

/**
 * setlist.fm rate limits aggressively and signals it with **403 Forbidden**,
 * not 429 — which is indistinguishable from a bad API key at a glance. Measured
 * behaviour: rapid sequential calls intermittently 403, while ~1.2s spacing is
 * reliably fine.
 *
 * So we do both: space calls out, and retry a 403 with backoff before deciding
 * the key is actually wrong.
 */
const MIN_SPACING_MS = 700;
const MAX_RETRIES = 3;

let lastCall = 0;

async function throttle() {
  const wait = MIN_SPACING_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function sfmFetch<T>(path: string): Promise<T> {
  let lastStatus = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();

    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-api-key': apiKey(), Accept: 'application/json' },
      next: { revalidate: 3600 },
    });

    if (res.ok) return res.json() as Promise<T>;
    lastStatus = res.status;

    // 404 is a real answer (no setlists for that query); don't burn retries.
    if (res.status === 404) throw new Error('setlist.fm 404: not found');

    if (res.status === 403 || res.status === 429) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(
        'setlist.fm refused the request after retries (403). This is usually rate ' +
          'limiting rather than a bad key — try again shortly.',
      );
    }

    throw new Error(`setlist.fm ${res.status}: ${await res.text()}`);
  }

  throw new Error(`setlist.fm request failed (${lastStatus})`);
}

/** setlist.fm dates are dd-MM-yyyy. Convert to an ISO date. */
export function parseSetlistDate(eventDate: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(eventDate);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Paginated: one page is 20 setlists. Caller decides how deep to go. */
/**
 * Shows by this artist on this exact date.
 *
 * Returns `[]` rather than throwing for the ordinary misses — an artist
 * setlist.fm has never heard of, or a night nobody logged — so a caller walking
 * the cascade is not forced to tell those apart from a real failure.
 */
export async function searchSetlists(
  artistName: string,
  isoDate: string,
  timeZone?: string | null,
): Promise<SFMSetlist[]> {
  if (!artistName.trim() || Number.isNaN(new Date(isoDate).getTime())) return [];
  // UTC by default, deliberately — see `toSetlistDate`.
  const date = toSetlistDate(isoDate, timeZone);

  const qs = new URLSearchParams({ artistName: artistName.trim(), date });
  try {
    const data = await sfmFetch<{ setlist?: SFMSetlist[] }>(`/search/setlists?${qs}`);
    return data.setlist ?? [];
  } catch (err) {
    // A 404 is how the API says "no results", and is not worth logging.
    const message = err instanceof Error ? err.message : String(err);
    if (!/\b404\b/.test(message)) console.error('setlist.fm search failed', { artistName, date, message });
    return [];
  }
}

export async function getAttended(userId: string, page = 1): Promise<{ setlists: SFMSetlist[]; total: number }> {
  const data = await sfmFetch<{ setlist?: SFMSetlist[]; total?: number }>(
    `/user/${encodeURIComponent(userId)}/attended?p=${page}`,
  );
  return { setlists: data.setlist ?? [], total: data.total ?? 0 };
}

/** Walk every page of a user's attended shows, bounded so we can't loop forever. */
export async function getAllAttended(userId: string, maxPages = 25): Promise<SFMSetlist[]> {
  const out: SFMSetlist[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { setlists, total } = await getAttended(userId, page);
    out.push(...setlists);
    if (out.length >= total || setlists.length === 0) break;
  }
  return out;
}

// ---------------------------------------------------------------- setlists

export interface SFMSong {
  name: string;
  info?: string;
  tape?: boolean;
  cover?: { name: string };
  with?: { name: string };
}

export interface SFMSet {
  name?: string;
  encore?: number;
  song?: SFMSong[];
}

export interface SFMFullSetlist extends SFMSetlist {
  sets?: { set?: SFMSet[] };
  info?: string;
}

/**
 * setlist.fm wants dd-MM-yyyy. Our events store ISO.
 *
 * Falls back to UTC, never the host's local zone: otherwise the same event
 * resolves to a different calendar date on a laptop in California than on a
 * Vercel function in UTC, and the lookup silently misses in one of them.
 */
export function toSetlistDate(iso: string, timeZone?: string | null): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: timeZone || 'UTC' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...opts,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

/**
 * Find the setlist for one specific show.
 *
 * Matched on artist + date rather than any shared id, because setlist.fm and
 * Ticketmaster have no common key. The date is taken in the VENUE's timezone —
 * a 9pm Pacific show is already "tomorrow" in UTC, which would miss.
 */
export async function getSetlistForEvent(
  artistName: string,
  startsAtIso: string,
  timeZone?: string | null,
): Promise<SFMFullSetlist | null> {
  const date = toSetlistDate(startsAtIso, timeZone);
  const qs = new URLSearchParams({ artistName, date });

  try {
    const data = await sfmFetch<{ setlist?: SFMFullSetlist[] }>(`/search/setlists?${qs}`);
    const hits = data.setlist ?? [];
    if (hits.length === 0) return null;

    // Prefer one that actually has songs; an empty stub setlist is common.
    return hits.find((s) => countSongs(s) > 0) ?? hits[0];
  } catch {
    // A missing setlist is the normal case, not an error worth surfacing.
    return null;
  }
}

export function countSongs(setlist: SFMFullSetlist): number {
  return (setlist.sets?.set ?? []).reduce((n, s) => n + (s.song?.length ?? 0), 0);
}
