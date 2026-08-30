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
/**
 * Canonical external ids for an artist, from MusicBrainz URL relations.
 *
 * This is the most useful thing MusicBrainz does for us, and it is not the
 * thing it is famous for. Every other provider here resolves an artist by
 * FUZZY NAME SEARCH, independently, which is how "Chris Stussy" turns into
 * "CHRIS STASSY" on one service and stays put on another. MusicBrainz has the
 * artist's actual accounts on each platform, curated by humans:
 *
 *     free streaming   https://open.spotify.com/artist/3BxjasMelf9pKaE4f7Y0So
 *     free streaming   https://www.deezer.com/artist/5359276
 *     other databases  https://ra.co/dj/chrisstussy
 *     bandcamp, soundcloud, official homepage, apple music, tidal, discogs…
 *
 * One free lookup replaces a fuzzy search on every platform after it. For a
 * memory app that matters twice over: exact artwork with no name-matching risk,
 * and a set of "where to listen" links for an act you saw once in a basement.
 *
 * Free, 1 request/second, no key — just an honest User-Agent.
 */
export interface MBArtistLinks {
  spotifyArtistId: string | null;
  deezerArtistId: string | null;
  /** Resident Advisor slug. RA is the canonical source for the club circuit. */
  residentAdvisor: string | null;
  bandcamp: string | null;
  soundcloud: string | null;
  officialHomepage: string | null;
  discogs: string | null;
  /** Everything else, keyed by MusicBrainz relation type. */
  other: Record<string, string>;
}

/** Pure: MusicBrainz relations -> the ids we can actually use. */
export function parseArtistLinks(
  relations: { type?: string; url?: { resource?: string } }[],
): MBArtistLinks {
  const links: MBArtistLinks = {
    spotifyArtistId: null,
    deezerArtistId: null,
    residentAdvisor: null,
    bandcamp: null,
    soundcloud: null,
    officialHomepage: null,
    discogs: null,
    other: {},
  };

  for (const rel of relations ?? []) {
    const url = rel.url?.resource;
    if (!url) continue;

    // Matched on the URL, not the relation type: Spotify and Deezer share the
    // type "free streaming", so the type alone cannot tell them apart.
    const spotify = /open\.spotify\.com\/artist\/([A-Za-z0-9]+)/.exec(url);
    if (spotify) { links.spotifyArtistId = spotify[1]; continue; }

    const deezer = /deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/.exec(url);
    if (deezer) { links.deezerArtistId = deezer[1]; continue; }

    const ra = /ra\.co\/dj\/([A-Za-z0-9_-]+)/.exec(url);
    if (ra) { links.residentAdvisor = ra[1]; continue; }

    if (/bandcamp\.com/.test(url)) { links.bandcamp ??= url; continue; }
    if (/soundcloud\.com/.test(url)) { links.soundcloud ??= url; continue; }
    if (/discogs\.com/.test(url)) { links.discogs ??= url; continue; }
    if (rel.type === 'official homepage') { links.officialHomepage ??= url; continue; }

    if (rel.type) links.other[rel.type] ??= url;
  }

  return links;
}

/**
 * Fetch an artist's external ids by MBID.
 *
 * Returns null rather than throwing — this decorates a row that already exists,
 * and MusicBrainz answers 503 under load often enough that a hard failure here
 * would be noise rather than signal.
 */
export async function getArtistLinks(mbid: string): Promise<MBArtistLinks | null> {
  if (!/^[0-9a-f-]{36}$/i.test(mbid)) return null;

  try {
    await throttle();
    const url = new URL(`${BASE}/artist/${mbid}`);
    url.searchParams.set('inc', 'url-rels');
    url.searchParams.set('fmt', 'json');

    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent() },
      // An artist's accounts effectively never change. A week is conservative,
      // and `artists.links` is the real cache in front of this.
      next: { revalidate: 604_800 },
    });
    // 503 is MusicBrainz's "slow down", and it is common under load. Not worth
    // an error-level log — the next cron pass picks the artist up again.
    if (!res.ok) return null;

    const data = (await res.json()) as {
      relations?: { type?: string; url?: { resource?: string } }[];
    };
    return parseArtistLinks(data.relations ?? []);
  } catch (err) {
    console.error('MusicBrainz artist links failed', { mbid, err });
    return null;
  }
}

export async function resolveMbid(name: string): Promise<string | null> {
  const hits = await searchArtist(name, 3);
  const top = hits[0];
  if (!top) return null;
  // MusicBrainz scores 0-100; below ~85 the match is usually a different act.
  if ((top.score ?? 0) < 85) return null;
  return top.id;
}
