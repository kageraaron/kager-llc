/**
 * Spotify — favorite-artist import only.
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
