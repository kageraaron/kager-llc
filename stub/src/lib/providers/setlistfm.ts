/**
 * setlist.fm — free for non-commercial use, key in the `x-api-key` header.
 *
 * The endpoint that earns its keep here is /user/{userId}/attended: it is the
 * best free source of a user's PAST concerts, which is exactly what the Archive
 * tab wants seeded. Ticketmaster only knows about events it sold tickets to.
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

async function sfmFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': apiKey(), Accept: 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`setlist.fm ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** setlist.fm dates are dd-MM-yyyy. Convert to an ISO date. */
export function parseSetlistDate(eventDate: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(eventDate);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Paginated: one page is 20 setlists. Caller decides how deep to go. */
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
