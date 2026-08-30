/**
 * Artist photos, from sources that cost nothing.
 *
 * A memory app is mostly pictures of the acts you saw, and the event providers
 * are unreliable about them: Ticketmaster and JamBase carry artwork only for
 * what they sell, the Spotify concerts proxy carries it only in its `details`
 * view, and Bandsintown carries none at all. So a club-circuit act — exactly
 * the kind this app is for — routinely lands with a blank thumbnail.
 *
 * This is the backfill for those, and it is deliberately built out of the two
 * cheapest sources available rather than a metered one.
 *
 * ## The order, and why
 *
 * **1. Deezer.** No API key, no OAuth, no account — a plain public endpoint.
 * Documented at 50 requests / 5 seconds per IP, which is far beyond anything
 * this does. Measured 2026-08-30: 5 of 5 exact hits including "Chris Stussy",
 * "Silva Bumpa" and "KETTAMA".
 *
 * **2. Spotify Web API search.** Free and already wired for client credentials,
 * but second only because it needs credentials to work at all.
 *
 * Both results go through `namesMatch` before being accepted: a search endpoint
 * with no relevance floor will always return *something*, and attaching a
 * stranger's face to someone's concert memory is a worse outcome than showing
 * initials.
 *
 * ## Artists rename, and the sources disagree about when
 *
 * Chris Stussy now records as **CHRIS STASSY**. Deezer still lists the old
 * spelling; Spotify has the new one. Our own row holds whatever the ticket email
 * said, which is usually the name at time of purchase — so the *stalest* of the
 * three.
 *
 * Both sources are therefore right, and a strict equality check would reject the
 * correct answer from whichever one happens to be current. That is why
 * `namesMatch` allows a single character of difference on a reasonably long
 * name: enough to survive a rename or a spelling drift, not enough to confuse
 * two distinct acts.
 */

import { getAppToken, isAppConfigured, pickArtistImage } from '@/lib/providers/spotify';

export interface ArtistImage {
  url: string;
  /** Which source answered — recorded so a bad source can be traced later. */
  source: 'deezer' | 'spotify';
  /** The name the source matched, which may differ in case or punctuation. */
  matchedName: string;
}

/** Casefold and strip everything that is not a letter or digit. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/** Levenshtein, bailing out as soon as the distance exceeds `max`. */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    // Every remaining path only grows, so an over-budget row settles it.
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * Names long enough that one character of difference is a spelling drift rather
 * than a different act. "Kiss" and "Kish" are not the same band; "chrisstussy"
 * and "chrisstassy" are the same person after a rename.
 */
const FUZZY_MIN_LENGTH = 8;

/**
 * Is this the same act, near enough to hang a photo on?
 *
 * Three ways to pass, in descending confidence: an exact normalized match, the
 * same name modulo a leading "the", or a single character of difference on a
 * name of at least `FUZZY_MIN_LENGTH`.
 *
 * That last allowance exists for a real case — Chris Stussy renaming to CHRIS
 * STASSY, where our row, Deezer and Spotify each hold a different vintage of
 * the name. Short names still require exactness, because one character is a
 * much larger share of them.
 */
export function namesMatch(query: string, candidate: string): boolean {
  const a = norm(query);
  const b = norm(candidate);
  if (!a || !b) return false;
  if (a === b) return true;

  const stripThe = (s: string) => s.replace(/^the/, '');
  if (stripThe(a) === stripThe(b)) return true;

  if (Math.min(a.length, b.length) >= FUZZY_MIN_LENGTH) {
    return withinEditDistance(a, b, 1);
  }
  return false;
}

/**
 * Deezer by EXACT artist id. No search, no name matching, no risk.
 *
 * This is the path to prefer whenever `artists.deezer_artist_id` is set — which
 * it is for any artist MusicBrainz has resolved. Everything below it is
 * guesswork by comparison: `namesMatch` exists only because a name search can
 * return the wrong person, and an id cannot.
 */
export async function fromDeezerId(deezerArtistId: string): Promise<ArtistImage | null> {
  try {
    const res = await fetch(`https://api.deezer.com/artist/${encodeURIComponent(deezerArtistId)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return null;

    const a = (await res.json()) as {
      name?: string;
      error?: unknown;
      picture_xl?: string;
      picture_big?: string;
      picture_medium?: string;
    };
    // Deezer answers 200 with an `error` object for an unknown id.
    if (a.error) return null;

    const picture = a.picture_xl || a.picture_big || a.picture_medium;
    return picture ? { url: picture, source: 'deezer', matchedName: a.name ?? '' } : null;
  } catch (err) {
    console.error('Deezer artist image by id failed', { deezerArtistId, err });
    return null;
  }
}

/** Deezer's artist search. No credentials of any kind. */
async function fromDeezer(name: string): Promise<ArtistImage | null> {
  const url = `https://api.deezer.com/search/artist?limit=3&q=${encodeURIComponent(name)}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Artist photos change rarely; a week is conservative and this is the
      // second cache after `artists.image_url` itself.
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      data?: { name?: string; picture_xl?: string; picture_big?: string; picture_medium?: string }[];
    };

    for (const artist of body.data ?? []) {
      if (!artist.name || !namesMatch(name, artist.name)) continue;
      const picture = artist.picture_xl || artist.picture_big || artist.picture_medium;
      if (picture) return { url: picture, source: 'deezer', matchedName: artist.name };
    }
    return null;
  } catch (err) {
    console.error('Deezer artist image lookup failed', { name, err });
    return null;
  }
}

/** Spotify search. Free, but needs the app credentials and can miss fuzzily. */
async function fromSpotify(name: string): Promise<ArtistImage | null> {
  if (!isAppConfigured()) return null;

  try {
    const token = await getAppToken();
    // `limit` caps at 10 for a development-mode app since February 2026; 3 is
    // plenty, since anything past the first few is not the artist anyway.
    const url = `https://api.spotify.com/v1/search?type=artist&limit=3&q=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      artists?: { items?: { name?: string; images?: { url: string; width?: number }[] }[] };
    };

    for (const artist of body.artists?.items ?? []) {
      if (!artist.name || !namesMatch(name, artist.name)) continue;
      const picture = pickArtistImage(artist.images);
      if (picture) return { url: picture, source: 'spotify', matchedName: artist.name };
    }
    return null;
  } catch (err) {
    console.error('Spotify artist image lookup failed', { name, err });
    return null;
  }
}

/**
 * Find a photo for an artist by name. Free sources only, cheapest first.
 *
 * Returns null rather than throwing: this decorates a row that already exists,
 * and a missing photo falls back to initials, which is a perfectly good outcome.
 */
export async function findArtistImage(
  name: string,
  ids: { deezerArtistId?: string | null; spotifyArtistId?: string | null } = {},
): Promise<ArtistImage | null> {
  /*
   * An id beats a name every time. When MusicBrainz has resolved this artist we
   * fetch the exact account and skip `namesMatch` entirely — there is nothing
   * to be uncertain about.
   */
  if (ids.deezerArtistId) {
    const exact = await fromDeezerId(ids.deezerArtistId);
    if (exact) return exact;
  }

  const trimmed = name.trim();
  if (trimmed.length < 2) return null;

  return (await fromDeezer(trimmed)) ?? (await fromSpotify(trimmed));
}
