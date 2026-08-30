import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chunk,
  lookupIds,
  pickArtistImage,
  getAppToken,
  getArtistMetadata,
  isAppConfigured,
  __resetAppToken,
  MAX_LOOKUPS,
} from '@/lib/providers/spotify';

/**
 * The client-credentials half of the Spotify Web API — artist metadata with no
 * user, no consent and no redirect URI.
 *
 * This is what makes artwork for a club-circuit act reliable: the concerts
 * proxy carries an image only in its `details` view, and nothing else in the
 * provider cascade has one at all.
 */

describe('lookupIds', () => {
  it('drops blanks and duplicates rather than spending a request on them', () => {
    // Each id is now its own HTTP request — Spotify removed Get Several
    // Artists for development-mode apps — so a wasted id is a wasted call.
    expect(lookupIds(['a', 'a', '', '  ', 'b'])).toEqual(['a', 'b']);
    expect(lookupIds([])).toEqual([]);
  });

  it('caps a single call so a huge bill cannot eat the function budget', () => {
    expect(MAX_LOOKUPS).toBe(12);
    const ids = Array.from({ length: 40 }, (_, i) => `id${i}`);
    expect(lookupIds(ids)).toHaveLength(12);
  });
});

describe('chunk', () => {
  it('groups for the concurrency pool', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 4)).toEqual([]);
  });
});

describe('pickArtistImage', () => {
  it('takes the widest image rather than trusting array order', () => {
    // Spotify happens to return these widest-first, but does not promise to.
    expect(
      pickArtistImage([
        { url: 'small', width: 160 },
        { url: 'big', width: 640 },
        { url: 'mid', width: 320 },
      ]),
    ).toBe('big');
  });

  it('returns null rather than undefined when there is no artwork', () => {
    expect(pickArtistImage([])).toBeNull();
    expect(pickArtistImage(undefined)).toBeNull();
  });

  it('tolerates images with no declared width', () => {
    expect(pickArtistImage([{ url: 'only' }])).toBe('only');
  });
});

describe('getArtistMetadata', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetAppToken();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.SPOTIFY_CLIENT_ID = 'test-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    __resetAppToken();
  });

  const json = (body: unknown) =>
    Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: () => Promise.resolve(body) });

  it('does nothing at all when the app has no credentials', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    expect(isAppConfigured()).toBe(false);

    const out = await getArtistMetadata(['2dPLkqesvPXpIlP65JoLrf']);
    expect(out.size).toBe(0);
    // Crucially, not even a token request — this must be free when unconfigured.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a token, then each artist singly, and keys the result by id', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValueOnce(
        json({
          id: '2dPLkqesvPXpIlP65JoLrf',
          name: 'Silva Bumpa',
          images: [
            { url: 'https://i.scdn.co/image/small', width: 160 },
            { url: 'https://i.scdn.co/image/big', width: 640 },
          ],
        }),
      );

    const out = await getArtistMetadata(['2dPLkqesvPXpIlP65JoLrf']);

    expect(out.get('2dPLkqesvPXpIlP65JoLrf')).toEqual({
      id: '2dPLkqesvPXpIlP65JoLrf',
      name: 'Silva Bumpa',
      imageUrl: 'https://i.scdn.co/image/big',
    });

    const [tokenUrl] = fetchMock.mock.calls[0];
    expect(String(tokenUrl)).toContain('accounts.spotify.com/api/token');
    // The SINGULAR path. `/artists?ids=` is 403 for a development-mode app.
    const [artistUrl] = fetchMock.mock.calls[1];
    expect(String(artistUrl)).toContain('/artists/2dPLkqesvPXpIlP65JoLrf');
    expect(String(artistUrl)).not.toContain('ids=');
  });

  it('reuses the cached token across calls', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValue(json({ id: 'x', name: 'X', images: [] }));

    await getArtistMetadata(['a']);
    await getArtistMetadata(['b']);

    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/token'),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('tolerates a 404 for an id Spotify does not know', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValueOnce(Promise.resolve({ ok: false, status: 404, headers: new Headers() }))
      .mockReturnValueOnce(json({ id: 'real', name: 'Dean Turnley', images: [] }));

    const out = await getArtistMetadata(['bogus', 'real']);
    expect([...out.keys()]).toEqual(['real']);
    expect(out.get('real')?.imageUrl).toBeNull();
  });

  it('survives the 403 a development-mode app gets on a removed endpoint', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValue(Promise.resolve({ ok: false, status: 403, headers: new Headers() }));

    await expect(getArtistMetadata(['a', 'b'])).resolves.toEqual(new Map());
  });

  it('backs off once on a 429, honouring Retry-After', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 429, headers: new Headers({ 'retry-after': '1' }) }),
      )
      .mockReturnValueOnce(json({ id: 'a', name: 'A', images: [] }));

    const out = await getArtistMetadata(['a']);
    expect(out.get('a')?.name).toBe('A');
  });

  it('gives up rather than holding the request open for a long rate limit', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 429, headers: new Headers({ 'retry-after': '600' }) }),
      );

    await expect(getArtistMetadata(['a'])).resolves.toEqual(new Map());
  });

  it('returns empty rather than throwing when the token request fails', async () => {
    // Enrichment decorates a write that must still succeed without it.
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 401 }));
    await expect(getArtistMetadata(['a'])).resolves.toEqual(new Map());
  });

  it('keeps the artists it did get when one lookup fails', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValueOnce(Promise.resolve({ ok: false, status: 500, headers: new Headers() }))
      .mockReturnValueOnce(json({ id: 'good', name: 'Good', images: [] }));

    const out = await getArtistMetadata(['bad', 'good']);
    expect(out.has('good')).toBe(true);
    expect(out.has('bad')).toBe(false);
  });

  it('survives a network throw', async () => {
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(getArtistMetadata(['a'])).resolves.toEqual(new Map());
  });

  it('reads only the fields a development-mode app actually receives', async () => {
    /*
     * February 2026 stripped `followers` and `popularity` from the artist
     * object, and `genres` is absent in practice too — measured across five
     * artists including Taylor Swift, none returned a `genres` key. So the
     * shape we depend on is exactly: id, name, images.
     */
    fetchMock
      .mockReturnValueOnce(json({ access_token: 'tok', expires_in: 3600 }))
      .mockReturnValueOnce(
        json({
          id: 'a',
          name: 'A',
          type: 'artist',
          uri: 'spotify:artist:a',
          href: 'https://api.spotify.com/v1/artists/a',
          external_urls: { spotify: 'https://open.spotify.com/artist/a' },
          images: [{ url: 'art', width: 640, height: 640 }],
        }),
      );

    expect((await getArtistMetadata(['a'])).get('a')).toEqual({
      id: 'a',
      name: 'A',
      imageUrl: 'art',
    });
  });
});

describe('getAppToken', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetAppToken();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.SPOTIFY_CLIENT_ID = 'test-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    __resetAppToken();
  });

  it('asks for the client_credentials grant with basic auth', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }) }),
    );

    expect(await getAppToken()).toBe('tok');

    const [, init] = fetchMock.mock.calls[0];
    expect(String(init.body)).toContain('grant_type=client_credentials');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('test-id:test-secret').toString('base64')}`,
    );
    // No redirect_uri and no scope: this flow authorizes no user.
    expect(String(init.body)).not.toContain('redirect_uri');
  });

  it('re-fetches once the cached token has expired', async () => {
    // A 30-second token is already expired under the 60-second safety haircut.
    fetchMock
      .mockReturnValueOnce(
        Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'first', expires_in: 30 }) }),
      )
      .mockReturnValueOnce(
        Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'second', expires_in: 3600 }) }),
      );

    expect(await getAppToken()).toBe('first');
    expect(await getAppToken()).toBe('second');
  });
});
