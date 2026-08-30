/**
 * Spotify Web API. Two independent flows live here.
 *
 * **1. Client credentials — artist metadata.** No user, no consent, no redirect
 * URI; just the app's own id and secret. Used to enrich artist rows with
 * canonical artwork and genres, keyed on the Spotify artist id the concerts
 * provider already hands us. The five-user cap below does NOT apply to it: it
 * authorizes no users at all.
 *
 * **2. Authorization code — favourite-artist import.** Per-user, and the one
 * the cap does bind.
 *
 * The Web API has no concerts, live-events or tour-date endpoints — that data
 * only exists behind Spotify's internal partner API, which is why
 * `providers/spotifyconcerts.ts` reads a proxy instead. This module cannot
 * replace it and is not trying to.
 *
 * IMPORTANT CONSTRAINT (Spotify platform update, 6 Feb 2026, enforced 9 Mar 2026):
 * a development-mode app is limited to FIVE authorized users, requires the
 * developer account to hold Premium, and each developer gets one Client ID.
 *
 * That is why Spotify is NOT a sign-in provider here — using it for auth would
 * cap the whole app at five people. It is an optional per-user connection, and
 * the UI tells the user when the five slots are gone.
 *
 * https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
 */

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export const SPOTIFY_SCOPES = ['user-follow-read', 'user-top-read'].join(' ');

/** Spotify dev mode ceiling — surfaced in the UI so the failure is legible. */
export const SPOTIFY_DEV_USER_CAP = 5;

export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
  images?: { url: string; width: number; height: number }[];
  external_urls?: { spotify?: string };
}

// ------------------------------------------- client credentials (no user)

/** Is the app itself configured? Distinct from a user having connected. */
export function isAppConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

/**
 * Cached app token.
 *
 * Module-scoped rather than stored in `lib/cache.ts` on purpose: this is a
 * bearer credential, and the cache table is shared, readable infrastructure.
 * A serverless instance is short-lived, so the worst case is a token request
 * per cold start — which is one cheap unauthenticated POST, not a quota item.
 *
 * The 60-second haircut on expiry avoids handing out a token that dies in
 * flight.
 */
let appToken: { value: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (appToken && Date.now() < appToken.expiresAt) return appToken.value;

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');

  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!res.ok) {
    throw new Error(`Spotify client-credentials token failed (${res.status})`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  appToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  };
  return appToken.value;
}

/** Reset the cached token. Tests only. */
export function __resetAppToken() {
  appToken = null;
}

/**
 * ## Why this fetches one artist at a time
 *
 * It would obviously rather batch — `/v1/artists?ids=` takes 50 at once. That
 * endpoint is **gone**. Spotify's February 2026 platform change removed every
 * "Get Several" endpoint for development-mode apps while keeping the
 * single-resource ones. Measured live on 2026-08-29 with an app token:
 *
 * | Endpoint | Status |
 * |---|---|
 * | `GET /artists/{id}` | **200** |
 * | `GET /artists?ids=…` | **403** |
 * | `GET /albums/{id}` / `GET /albums?ids=…` | 200 / **403** |
 * | `GET /tracks/{id}` / `GET /tracks?ids=…` | 200 / **403** |
 * | `GET /search` | 200 (but `limit` now caps at 10) |
 * | `GET /artists/{id}/albums` | 200 |
 * | `GET /artists/{id}/top-tracks` | **403** |
 * | `GET /artists/{id}/related-artists` | **403** |
 * | `GET /browse/new-releases`, `GET /markets` | **403** |
 *
 * That matches the published list, with one exception: the changelog says Get
 * Related Artists is still supported and it answered 403 here. Trust the
 * measurement.
 *
 * https://developer.spotify.com/documentation/web-api/references/changes/february-2026
 *
 * So a lineup costs one request per act, not one per event. Two things keep
 * that honest: callers pre-filter to artists actually missing data (see
 * `missingMetadata` in `ingest/catalog.ts`), so in the steady state a new
 * booking costs one or two requests rather than a dozen; and `MAX_LOOKUPS`
 * caps a single call regardless of how long the bill is.
 */

/** Requests issued at once. Small: this is best-effort work inside a request. */
const CONCURRENCY = 4;

/**
 * Ceiling on lookups per call. A lineup is already capped at 12 upstream; this
 * is the backstop that keeps a pathological payload from spending the whole
 * function budget on enrichment.
 */
export const MAX_LOOKUPS = 12;

/** Split into fixed-size groups. Used for the concurrency pool. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Deduplicate, drop blanks, and apply the per-call ceiling. */
export function lookupIds(ids: string[], max = MAX_LOOKUPS): string[] {
  return [...new Set(ids.filter((id) => id && id.trim().length > 0))].slice(0, max);
}

/**
 * Biggest image Spotify offers for an artist.
 *
 * The array is ordered widest-first in practice, but that is not promised
 * anywhere, so pick on width rather than trusting position.
 */
export function pickArtistImage(images?: { url: string; width?: number }[]): string | null {
  if (!images?.length) return null;
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
}

export interface ArtistMetadata {
  id: string;
  name: string;
  imageUrl: string | null;
}

/**
 * NOTE: no `genres`, and no `popularity`.
 *
 * February 2026 removed `followers` and `popularity` from the artist object for
 * development-mode apps. `genres` is not on the published removal list but is
 * absent in practice — measured 2026-08-29 across five artists including Taylor
 * Swift and The Weeknd, every one returned an object with no `genres` key at
 * all. The full dev-mode artist object is: `external_urls`, `href`, `id`,
 * `images`, `name`, `type`, `uri`.
 *
 * So artist genres still come only from Ticketmaster and JamBase. The concerts
 * proxy's `concepts` array is the nearest equivalent for a club act, and is
 * deliberately not read — it is localized (it says "electrónica").
 */
function toMetadata(artist: SpotifyArtist): ArtistMetadata {
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: pickArtistImage(artist.images),
  };
}

/**
 * One artist, or null.
 *
 * Null covers every "we did not get it" case — unknown id, rate limit, network
 * failure — because none of them should be distinguishable to a caller that is
 * only decorating a row it has already written.
 *
 * A 429 is retried once, honouring `Retry-After`, but only when the wait is
 * short enough to be worth holding the request open for.
 */
export async function getArtist(id: string, token: string): Promise<ArtistMetadata | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API}/artists/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        // Artist artwork and genres are close to static; a day is not too long.
        next: { revalidate: 86_400 },
      });
    } catch (err) {
      console.error('Spotify artist fetch failed', { id, err });
      return null;
    }

    if (res.ok) return toMetadata((await res.json()) as SpotifyArtist);

    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get('retry-after') ?? '0');
      if (wait > 0 && wait <= 5) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      console.warn(`Spotify rate limited on artist ${id}; retry-after ${wait}s`);
      return null;
    }

    if (res.status === 403) {
      // Not a per-id problem: the app cannot reach this endpoint at all.
      console.error('Spotify artist lookup forbidden — check the app’s API access');
    } else if (res.status !== 404) {
      console.error(`Spotify artist lookup ${res.status} for ${id}`);
    }
    return null;
  }
  return null;
}

/**
 * Artwork for a set of Spotify artist ids. **No user token needed.**
 *
 * ## Scope: this is a FALLBACK, not an upgrade
 *
 * Measured 2026-08-29, the image this returns for Silva Bumpa is the *same URL*
 * the concerts proxy already hands us — `ab6761610000e5eb…`, the 640px render.
 * Where the proxy has an image, calling this buys nothing.
 *
 * What it is actually for is the case where the proxy has NO image: its
 * `details` view is what carries artist artwork, and `detailsLimit` caps how
 * many concerts in a response get that view. Later rows of a long tour come
 * back with names only. Those artists have a Spotify id and no picture, and
 * this is the only way to get them one.
 *
 * Callers must therefore pass only the ids they are missing artwork for — see
 * `upsertSpotifyEvent`. Passing a whole lineup spends a request per act to
 * re-learn URLs already in hand.
 *
 * Returns a Map so callers can look up by id without rescanning, and returns
 * whatever succeeded rather than throwing — enrichment is a nice-to-have, and
 * must never sink the write it is decorating.
 */
export async function getArtistMetadata(ids: string[]): Promise<Map<string, ArtistMetadata>> {
  const out = new Map<string, ArtistMetadata>();
  if (!isAppConfigured()) return out;

  const wanted = lookupIds(ids);
  if (wanted.length === 0) return out;

  let token: string;
  try {
    token = await getAppToken();
  } catch (err) {
    console.error('Spotify app token failed', err);
    return out;
  }

  for (const group of chunk(wanted, CONCURRENCY)) {
    const results = await Promise.all(group.map((id) => getArtist(id, token)));
    for (const meta of results) {
      if (meta?.id) out.set(meta.id, meta);
    }
  }

  return out;
}

// ------------------------------------------------ authorization code (user)

export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(`${ACCOUNTS}/authorize`);
  url.searchParams.set('client_id', process.env.SPOTIFY_CLIENT_ID!);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SPOTIFY_SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCode(code: string, redirectUri: string) {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');

  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // A dev-mode app past its 5-user cap fails here, not at /authorize.
    throw new Error(`Spotify token exchange failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');

  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Spotify refresh failed (${res.status})`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

/** Artists the user follows. Cursor-paginated, unlike the rest of the API. */
export async function getFollowedArtists(token: string): Promise<SpotifyArtist[]> {
  const out: SpotifyArtist[] = [];
  let after: string | undefined;

  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ type: 'artist', limit: '50' });
    if (after) qs.set('after', after);
    const data = await api<{ artists: { items: SpotifyArtist[]; cursors?: { after?: string } } }>(
      token,
      `/me/following?${qs}`,
    );
    out.push(...data.artists.items);
    after = data.artists.cursors?.after;
    if (!after || data.artists.items.length === 0) break;
  }
  return out;
}

export async function getTopArtists(
  token: string,
  timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
): Promise<SpotifyArtist[]> {
  const data = await api<{ items: SpotifyArtist[] }>(
    token,
    `/me/top/artists?limit=50&time_range=${timeRange}`,
  );
  return data.items;
}
