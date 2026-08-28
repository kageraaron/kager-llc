/**
 * MusicBrainz — our canonical artist identity (MBID).
 *
 * Ticketmaster attraction ids, Spotify ids and setlist.fm all key off different
 * namespaces; MBID is the one they can all be reconciled to, which is why the
 * `artists` table stores it as the unique identity column.
 *
 * Rate limit: 1 request/second, and a descriptive User-Agent is mandatory —
 * requests without one get blocked.
 */

const BASE = 'https://musicbrainz.org/ws/2';

function userAgent(): string {
  return process.env.MUSICBRAINZ_USER_AGENT ?? 'Stub/0.1.0 ( https://github.com/ekager )';
}

export interface MBArtist {
  id: string;
  name: string;
  'sort-name'?: string;
  disambiguation?: string;
  score?: number;
}

let lastCall = 0;

/** MusicBrainz allows 1 req/s. Serialize with a simple spacing gate. */
async function throttle() {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function searchArtist(name: string, limit = 5): Promise<MBArtist[]> {
  await throttle();
  const url = new URL(`${BASE}/artist`);
  url.searchParams.set('query', name);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fmt', 'json');

  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent() },
    next: { revalidate: 86_400 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { artists?: MBArtist[] };
  return data.artists ?? [];
}

/** Resolve a free-text artist name to an MBID, or null if nothing is confident. */
export async function resolveMbid(name: string): Promise<string | null> {
  const hits = await searchArtist(name, 3);
  const top = hits[0];
  if (!top) return null;
  // MusicBrainz scores 0-100; below ~85 the match is usually a different act.
  if ((top.score ?? 0) < 85) return null;
  return top.id;
}
