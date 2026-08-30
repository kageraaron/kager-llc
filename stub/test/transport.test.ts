import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRecordedFetch, recordedBody, loadRecorded } from './helpers/recorded';
import { getArtistEvents, getArtistPastEvents } from '@/lib/providers/bandsintown';
import { getEvent as ebGetEvent } from '@/lib/providers/eventbrite';
import { getArtistMetadata, __resetAppToken } from '@/lib/providers/spotify';
import { searchArtistConcerts } from '@/lib/providers/spotifyconcerts';

/**
 * The layer between `fetch` and the normalizer — replayed from real recordings.
 *
 * Every provider bug in this codebase so far has lived exactly here, and every
 * one of them passed a green suite:
 *
 *  - **Bandsintown** read `body.result.data` (the Parse MCP envelope) from an
 *    endpoint that returns `{ status, data }`. Every call threw; `matchTicket`
 *    swallowed it; the provider silently contributed nothing for weeks.
 *  - **Spotify Web API** lost its batch `/artists?ids=` endpoint to the
 *    February 2026 development-mode changes — 403, while singular stays 200.
 *  - The same change stripped `genres` from the artist object entirely.
 *
 * None is visible in a pure-function test. All three are caught below, offline.
 *
 * Re-record with `npm run fixtures:record` when a provider changes shape, and
 * read the diff — a surprise there is the point.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Bandsintown transport', () => {
  beforeEach(() => {
    process.env.PARSE_API_KEY = 'test-key';
  });

  it('reads the REST envelope the endpoint actually returns', async () => {
    /*
     * THE regression. The recorded body is `{ status: "success", data: {...} }`
     * with no `result` wrapper. Reading `body.result.data` threw on every call.
     */
    const raw = recordedBody<Record<string, unknown>>('bandsintown.artist-events');
    expect(raw).toHaveProperty('status', 'success');
    expect(raw).toHaveProperty('data');
    expect(raw).not.toHaveProperty('result');

    useRecordedFetch([
      { match: 'get_artist_events_by_name', fixture: 'bandsintown.artist-events' },
    ]);

    const out = await getArtistEvents('KETTAMA');
    expect(out.artist?.name).toBe('Kettama');
    expect(out.artist?.slug).toBe('15142594-kettama');
    expect(out.events.length).toBeGreaterThan(0);
  });

  it('parses past events, the only source for a show that already happened', async () => {
    useRecordedFetch([
      { match: 'get_artist_past_events', fixture: 'bandsintown.past-events' },
    ]);

    const past = await getArtistPastEvents('15142594-kettama');
    expect(past.length).toBeGreaterThan(0);

    // The show that sat unmatched in a real inbox until past-events was wired in.
    const regency = past.find((e) => e.venueName === 'The Regency Ballroom');
    expect(regency).toBeDefined();
    expect(regency!.startsAtLocal.slice(0, 10)).toMatch(/^2026-05-0[678]$/);
  });

  it('surfaces a provider-level failure instead of returning empty', async () => {
    // A thrown error is right: `matchTicket` decides whether to continue. What
    // must never happen is a silent success carrying no data.
    useRecordedFetch([
      { match: 'get_artist_events_by_name', fixture: 'bandsintown.artist-events', status: 500 },
    ]);
    await expect(getArtistEvents('KETTAMA')).rejects.toThrow(/Bandsintown 500/);
  });
});

describe('Eventbrite transport', () => {
  beforeEach(() => {
    process.env.EVENTBRITE_API_KEY = 'test-key';
  });

  it('resolves the event, with the IANA zone that fixes the 5 AM bug', async () => {
    useRecordedFetch([{ match: '/v3/events/1998116550390', fixture: 'eventbrite.event' }]);

    const ev = await ebGetEvent('1998116550390');
    expect(ev).not.toBeNull();
    expect(ev!.name).toBe('Silva Bumpa');
    expect(ev!.timezone).toBe('America/Los_Angeles');
    expect(ev!.startsAt).toBe('2026-09-28T05:00:00Z');
    expect(ev!.venueName).toBe('Monarch');
  });

  it('expands the venue — without it there is no address at all', async () => {
    const { calls } = useRecordedFetch([
      { match: '/v3/events/1998116550390', fixture: 'eventbrite.event' },
    ]);
    await ebGetEvent('1998116550390');
    expect(calls[0]).toContain('expand=venue');
  });

  it('returns null on a 404 rather than throwing at the cascade', async () => {
    useRecordedFetch([{ match: '/v3/events/', fixture: 'eventbrite.event-not-found' }]);
    await expect(ebGetEvent('1')).resolves.toBeNull();
  });

  it('pins that public event search is still gone', () => {
    /*
     * If this recording ever comes back 200, Eventbrite can answer "what's on
     * near me" and earns a place in Browse. Until then it is id-lookup only.
     */
    expect(loadRecorded('eventbrite.search-removed').status).toBe(404);
  });
});

describe('Spotify Web API transport', () => {
  beforeEach(() => {
    __resetAppToken();
    process.env.SPOTIFY_CLIENT_ID = 'test-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    __resetAppToken();
  });

  it('uses the SINGULAR artist endpoint, never the batch one', async () => {
    const { calls } = useRecordedFetch([
      { match: 'accounts.spotify.com/api/token', fixture: 'spotifyweb.token' },
      { match: '/v1/artists/', fixture: 'spotifyweb.artist' },
    ]);

    const out = await getArtistMetadata(['2dPLkqesvPXpIlP65JoLrf']);
    expect(out.get('2dPLkqesvPXpIlP65JoLrf')?.name).toBe('Silva Bumpa');
    expect(out.get('2dPLkqesvPXpIlP65JoLrf')?.imageUrl).toContain('i.scdn.co');

    // Batching would be cheaper and is deliberately not done — the endpoint 403s.
    expect(calls.some((c) => c.includes('/v1/artists?ids='))).toBe(false);
  });

  it('records that the batch endpoint is forbidden for a dev-mode app', () => {
    // If this ever becomes 200, one request can serve a whole lineup again.
    expect(loadRecorded('spotifyweb.artists-batch-forbidden').status).toBe(403);
  });

  it('confirms the artist object carries no genres to a dev-mode app', () => {
    const artist = recordedBody<Record<string, unknown>>('spotifyweb.artist');
    expect(Object.keys(artist).sort()).toEqual([
      'external_urls', 'href', 'id', 'images', 'name', 'type', 'uri',
    ]);
    expect(artist.genres).toBeUndefined();
    expect(artist.popularity).toBeUndefined();
  });
});

describe('Spotify concerts transport', () => {
  beforeEach(() => {
    process.env.RAPID_API_KEY = 'test-key';
  });

  it('rebuilds the Spanish lineup title the proxy cannot be asked to change', async () => {
    useRecordedFetch([
      { match: 'search-concert-artists', fixture: 'spotifyconcerts.artist-search' },
    ]);

    const { concerts } = await searchArtistConcerts('Silva Bumpa');
    const monarch = concerts.find((c) => c.venueName === 'Monarch')!;

    // Recorded verbatim as "Silva Bumpa y Dean Turnley".
    expect(monarch.title).toBe('Silva Bumpa and Dean Turnley');
    expect(monarch.artists).toEqual(['Silva Bumpa', 'Dean Turnley']);
  });

  it('leaves a promoter’s real festival title alone', async () => {
    useRecordedFetch([
      { match: 'search-concert-artists', fixture: 'spotifyconcerts.artist-search' },
    ]);

    const { concerts } = await searchArtistConcerts('Silva Bumpa');
    const festival = concerts.find((c) => c.isFestival)!;
    expect(festival.title).toBe('ARC Music Festival 2026');
  });

  it('picks up artist artwork from the details view', async () => {
    useRecordedFetch([
      { match: 'search-concert-artists', fixture: 'spotifyconcerts.artist-search' },
    ]);

    const { concerts } = await searchArtistConcerts('Silva Bumpa');
    const monarch = concerts.find((c) => c.venueName === 'Monarch')!;
    expect(monarch.lineup[0].imageUrl).toContain('i.scdn.co');
    expect(monarch.lineup[0].spotifyArtistId).toBe('2dPLkqesvPXpIlP65JoLrf');
  });
});

describe('the harness itself', () => {
  it('throws rather than letting a test reach the network', async () => {
    process.env.EVENTBRITE_API_KEY = 'test-key';
    useRecordedFetch([{ match: '/v3/events/123', fixture: 'eventbrite.event' }]);

    // `getEvent` catches its own errors, so assert through the raw fetch.
    await expect(fetch('https://example.com/not-recorded')).rejects.toThrow(
      /No recorded response/,
    );
  });
});
