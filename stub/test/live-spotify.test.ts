import { describe, it, expect } from 'vitest';
import { getArtistMetadata, getArtist, getAppToken, isAppConfigured } from '@/lib/providers/spotify';

/**
 * Live check of the Spotify Web API client-credentials path.
 *
 * The offline suite mocks `fetch`, so it proves the shape of our code and
 * nothing about Spotify's. This proves the flow actually works against the real
 * API with the app's own credentials — no user, no consent, no redirect URI.
 *
 * It also pins the platform constraint that shaped the implementation:
 * **February 2026 removed every "Get Several" endpoint for development-mode
 * apps.** `GET /artists/{id}` answers 200; `GET /artists?ids=…` answers 403.
 * That is why enrichment fetches one artist at a time. If Spotify ever restores
 * batch access this test is where it will show up, and batching becomes worth
 * reinstating.
 *
 * Skipped unless LIVE_TEST=1 and the credentials are present, so `npm test`
 * stays offline and fast:
 *
 *   LIVE_TEST=1 npx vitest run test/live-spotify.test.ts
 */

const live = process.env.LIVE_TEST === '1' && isAppConfigured();

// Silva Bumpa and Dean Turnley — the Monarch bill from the original bug report.
const SILVA_BUMPA = '2dPLkqesvPXpIlP65JoLrf';
const DEAN_TURNLEY = '3BcWcwYXVjvLWHMGKsuvsd';

describe.skipIf(!live)('Spotify Web API — client credentials', () => {
  it('gets an app token with no user involved', async () => {
    const token = await getAppToken();
    expect(token.length).toBeGreaterThan(50);
  });

  it('fetches one artist, with artwork', async () => {
    const token = await getAppToken();
    const artist = await getArtist(SILVA_BUMPA, token);

    expect(artist).not.toBeNull();
    expect(artist!.name).toBe('Silva Bumpa');
    // The point of this integration: a club-circuit act with real artwork.
    expect(artist!.imageUrl).toMatch(/^https:\/\/i\.scdn\.co\/image\//);
  });

  it('confirms genres are NOT available, despite the docs not listing them', async () => {
    /*
     * The February 2026 migration guide lists `followers` and `popularity` as
     * removed from the artist object, and does NOT list `genres`. The API
     * disagrees: no artist returns a `genres` key to a development-mode app,
     * Taylor Swift included. This pins the measurement — if it ever starts
     * coming back, artist genres become worth storing from here.
     */
    const token = await getAppToken();
    const raw = await (
      await fetch(`https://api.spotify.com/v1/artists/${SILVA_BUMPA}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    expect(Object.keys(raw).sort()).toEqual(
      ['external_urls', 'href', 'id', 'images', 'name', 'type', 'uri'],
    );
    expect(raw.genres).toBeUndefined();
    expect(raw.popularity).toBeUndefined();
  });

  it('resolves a whole lineup', async () => {
    const out = await getArtistMetadata([SILVA_BUMPA, DEAN_TURNLEY]);

    expect([...out.keys()].sort()).toEqual([SILVA_BUMPA, DEAN_TURNLEY].sort());
    for (const meta of out.values()) {
      expect(meta.imageUrl).toBeTruthy();
    }
  });

  it('returns nothing, and does not throw, for an id Spotify does not know', async () => {
    const token = await getAppToken();
    // Well-formed base-62 id that resolves to no artist.
    expect(await getArtist('0000000000000000000000', token)).toBeNull();
  });

  it('documents the February 2026 endpoint removals', async () => {
    const token = await getAppToken();
    const status = async (path: string) =>
      (await fetch(`https://api.spotify.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })).status;

    // Supported for a development-mode app.
    expect(await status(`artists/${SILVA_BUMPA}`)).toBe(200);

    // Removed. This is the constraint the implementation is built around: if it
    // ever goes back to 200, one request could serve a whole lineup again.
    expect(await status(`artists?ids=${SILVA_BUMPA},${DEAN_TURNLEY}`)).toBe(403);
  });
});
