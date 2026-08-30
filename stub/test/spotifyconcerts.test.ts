import { describe, it, expect } from 'vitest';
import {
  matchesQuery,
  normalizeConcert,
  headlinerOf,
  milesBetween,
  titleFor,
  withinRadius,
  type SpotifyConcert,
} from '@/lib/providers/spotifyconcerts';

/**
 * Rows captured verbatim from the live API, trimmed to the fields we read.
 * The two that matter are both real edge cases, not invented ones.
 */

// Public Works, SF — the club show absent from both JamBase and Ticketmaster.
const publicWorks = {
  id: '5bSV3ieWzSeLBTO5mkAART',
  uri: 'spotify:concert:5bSV3ieWzSeLBTO5mkAART',
  title: 'Overmono y Ben UFO',
  startDateIsoString: '2026-09-27T22:00-07:00',
  city: 'San Francisco',
  country: 'US',
  region: 'CA',
  venueName: 'Public Works',
  venueId: '5u7iKRtfphAOgsoOZWrQbE',
  coordinates: { latitude: 37.768914, longitude: -122.419251 },
  festival: false,
  shareUrl: 'https://open.spotify.com/concert/5bSV3ieWzSeLBTO5mkAART',
  artists: [{ name: 'Overmono' }, { name: 'Ben UFO' }],
};

// A festival with a 25-name bill, Overmono tenth, and NO venue id.
const wildlands = {
  id: '1boldqta4eclcgjj4T6hSf',
  title: 'WILDLANDS 2027 | Boorloo - Perth',
  startDateIsoString: '2027-01-02T12:30+08:00',
  city: 'Perth',
  country: 'AU',
  region: null,
  venueName: 'Arena Joondalup',
  venueId: null,
  coordinates: { latitude: -31.736334, longitude: 115.760754 },
  festival: true,
  shareUrl: 'https://open.spotify.com/concert/1boldqta4eclcgjj4T6hSf',
  artists: [
    { name: 'John Summit' },
    { name: 'Skepta' },
    { name: 'Worship' },
    { name: 'KI/KI' },
    { name: 'Disco Lines' },
    { name: 'Ewan McVicar' },
    { name: 'Funk Tribu' },
    { name: 'Hannah Laing' },
    { name: 'Nia Archives' },
    { name: 'Overmono' },
  ],
};

describe('matchesQuery', () => {
  it('accepts a prefix of the artist name — the whole point of using this API', () => {
    // Ticketmaster returns zero for both of these; that is TODO §4's complaint.
    expect(matchesQuery('Chris L', 'Chris Lake')).toBe(true);
    expect(matchesQuery('taylor swif', 'Taylor Swift')).toBe(true);
    expect(matchesQuery('overmon', 'Overmono')).toBe(true);
  });

  it('accepts an exact match regardless of case and punctuation', () => {
    expect(matchesQuery('the fratellis', 'The Fratellis')).toBe(true);
    expect(matchesQuery('KI/KI', 'KIKI')).toBe(true);
  });

  it('rejects the fuzzy miss the search returns instead of nothing', () => {
    // The API has no relevance floor: it answers "zzzznotanartist" with the
    // band "Zzz.". Note "zzz" IS a prefix of the query, so a naive
    // bidirectional prefix test would let this through.
    expect(matchesQuery('zzzznotanartist', 'Zzz.')).toBe(false);
  });

  it('still allows a query that slightly overruns the artist name', () => {
    expect(matchesQuery('Skeptaa', 'Skepta')).toBe(true);
    expect(matchesQuery('Skepta live', 'Skepta')).toBe(false);
  });

  it('rejects empty input on either side', () => {
    expect(matchesQuery('', 'Overmono')).toBe(false);
    expect(matchesQuery('Overmono', '')).toBe(false);
    expect(matchesQuery('!!!', 'Overmono')).toBe(false);
  });
});

describe('normalizeConcert', () => {
  it('normalises an offset timestamp with no seconds to a real ISO instant', () => {
    // The API emits `2026-09-27T22:00-07:00` — note the missing seconds. This
    // must never reach Postgres unnormalised.
    expect(normalizeConcert(publicWorks)?.startsAt).toBe('2026-09-28T05:00:00.000Z');
    expect(normalizeConcert(wildlands)?.startsAt).toBe('2027-01-02T04:30:00.000Z');
  });

  it('carries venue, coordinates and region through', () => {
    const c = normalizeConcert(publicWorks)!;
    expect(c.venueName).toBe('Public Works');
    expect(c.venueId).toBe('5u7iKRtfphAOgsoOZWrQbE');
    expect(c.city).toBe('San Francisco');
    expect(c.region).toBe('CA');
    expect(c.country).toBe('US');
    expect(c.lat).toBeCloseTo(37.768914);
    expect(c.isFestival).toBe(false);
    expect(c.artists).toEqual(['Overmono', 'Ben UFO']);
  });

  it('tolerates a named venue with no venue id', () => {
    const c = normalizeConcert(wildlands)!;
    expect(c.venueName).toBe('Arena Joondalup');
    expect(c.venueId).toBeNull();
    expect(c.isFestival).toBe(true);
  });

  it('falls back to the uri when id is absent', () => {
    const { id: _drop, ...noId } = publicWorks;
    expect(normalizeConcert(noId)?.id).toBe('5bSV3ieWzSeLBTO5mkAART');
  });

  it('drops rows with no usable date rather than storing NaN', () => {
    expect(normalizeConcert({ ...publicWorks, startDateIsoString: undefined })).toBeNull();
    expect(normalizeConcert({ ...publicWorks, startDateIsoString: 'not a date' })).toBeNull();
    expect(normalizeConcert({ uri: undefined, id: undefined, startDateIsoString: '2027-01-01T00:00Z' })).toBeNull();
  });
});

/**
 * The Monarch booking, captured verbatim on 2026-08-29 — the row behind a real
 * bug report: a 10pm show that displayed as "Mon, Sep 28 · 5:00 AM" under a
 * title in Spanish.
 */
const monarch = {
  id: '1cWJyvWq75SuamFtKUrSOs',
  uri: 'spotify:concert:1cWJyvWq75SuamFtKUrSOs',
  title: 'Silva Bumpa y Dean Turnley',
  startDateIsoString: '2026-09-27T22:00-07:00',
  city: 'San Francisco',
  country: 'US',
  region: 'CA',
  venueName: 'Monarch',
  venueId: '4a9o74auIB2iAVrR0xV91F',
  coordinates: { latitude: 37.7809861, longitude: -122.4085 },
  festival: false,
  shareUrl: 'https://open.spotify.com/concert/1cWJyvWq75SuamFtKUrSOs',
  artists: [{ name: 'Silva Bumpa' }, { name: 'Dean Turnley' }],
  details: {
    artists: [
      {
        id: '2dPLkqesvPXpIlP65JoLrf',
        uri: 'spotify:artist:2dPLkqesvPXpIlP65JoLrf',
        name: 'Silva Bumpa',
        imageUrl: 'https://i.scdn.co/image/ab6761610000e5ebd52a564d068eb5b06ad3bd25',
      },
      {
        id: '3BcWcwYXVjvLWHMGKsuvsd',
        uri: 'spotify:artist:3BcWcwYXVjvLWHMGKsuvsd',
        name: 'Dean Turnley',
        imageUrl: 'https://i.scdn.co/image/ab6761610000e5ebeaab6c2f430d35bce8b88240',
      },
    ],
  },
};

describe('titleFor — localized lineup joins', () => {
  const lineup = (...names: string[]) =>
    names.map((name) => ({ name, spotifyArtistId: null, imageUrl: null }));

  it('rewrites the conjunction Spotify localizes from Accept-Language', () => {
    /*
     * Spotify builds the title server-side and localizes it. The same concert
     * page proves it — en-US gives "Silva Bumpa, Dean Turnley", es-ES gives
     * "Silva Bumpa y Dean Turnley" — and this proxy is pinned to Spanish with
     * no parameter or header that overrides it. Verified live 2026-08-29:
     * "Silva Bumpa y Dean Turnley", "Overmono y Ben UFO", "Real McCoy y Turbo B.".
     */
    expect(titleFor('Silva Bumpa y Dean Turnley', lineup('Silva Bumpa', 'Dean Turnley')))
      .toBe('Silva Bumpa and Dean Turnley');
    expect(titleFor('Overmono y Ben UFO', lineup('Overmono', 'Ben UFO')))
      .toBe('Overmono and Ben UFO');
  });

  it('handles a long bill, keeping the promoter’s billing order', () => {
    const names = ['Dom Dolla', 'Chris Lorenzo', 'Silva Bumpa', 'Bushbaby', 'Cole Knight'];
    expect(titleFor('Dom Dolla, Chris Lorenzo, Silva Bumpa, Bushbaby y Cole Knight', lineup(...names)))
      .toBe('Dom Dolla, Chris Lorenzo, Silva Bumpa, Bushbaby and Cole Knight');
  });

  it('leaves a promoter’s real title alone', () => {
    // These carry information the lineup does not, so rewriting them would lose
    // rather than fix. Neither splits into exactly the billed acts.
    expect(titleFor('Goldrush: Midnight Riders', lineup('Silva Bumpa')))
      .toBe('Goldrush: Midnight Riders');
    expect(titleFor('Leeds Festival 2026 - Sunday', lineup('Silva Bumpa', 'Skepta')))
      .toBe('Leeds Festival 2026 - Sunday');
    expect(titleFor('WILDLANDS 2027 | Boorloo - Perth', lineup('John Summit', 'Overmono')))
      .toBe('WILDLANDS 2027 | Boorloo - Perth');
  });

  it('fails safe on an artist name that contains a conjunction', () => {
    // "Y La Bamba" splits into "La Bamba", which no longer matches the billed
    // act — so the provider's title survives untouched. Leaving it alone is the
    // right failure: worst case we keep what the API said.
    expect(titleFor('Y La Bamba y Tuck', lineup('Y La Bamba', 'Tuck')))
      .toBe('Y La Bamba y Tuck');
  });

  it('passes a single-act title through', () => {
    expect(titleFor('Silva Bumpa', lineup('Silva Bumpa'))).toBe('Silva Bumpa');
    expect(titleFor('Silva Bumpa at Monarch', lineup('Silva Bumpa'))).toBe('Silva Bumpa at Monarch');
  });

  it('passes anything through when the lineup is unknown', () => {
    expect(titleFor('Some Show', [])).toBe('Some Show');
  });
});

describe('normalizeConcert — lineup and artwork', () => {
  it('rebuilds the title from the billed acts', () => {
    expect(normalizeConcert(monarch)?.title).toBe('Silva Bumpa and Dean Turnley');
  });

  it('picks up the artist ids and artwork that only the details view carries', () => {
    // Without this a club-circuit act has no image from ANY provider in the
    // cascade, and the card renders a blank thumbnail.
    const c = normalizeConcert(monarch)!;
    expect(c.lineup).toHaveLength(2);
    expect(c.lineup[0]).toMatchObject({
      name: 'Silva Bumpa',
      spotifyArtistId: '2dPLkqesvPXpIlP65JoLrf',
    });
    expect(c.lineup[0].imageUrl).toContain('i.scdn.co');
    expect(c.artists).toEqual(['Silva Bumpa', 'Dean Turnley']);
  });

  it('still produces a lineup when only names are available', () => {
    const c = normalizeConcert(publicWorks)!;
    expect(c.lineup.map((a) => a.name)).toEqual(['Overmono', 'Ben UFO']);
    expect(c.lineup[0].spotifyArtistId).toBeNull();
    expect(c.lineup[0].imageUrl).toBeNull();
  });

  it('stores the right instant for a show that crosses the UTC date boundary', () => {
    // 22:00 PDT on the 27th IS 05:00 UTC on the 28th. The instant was never the
    // bug — rendering it without a zone was.
    expect(normalizeConcert(monarch)?.startsAt).toBe('2026-09-28T05:00:00.000Z');
  });
});

describe('headlinerOf', () => {
  const fest = normalizeConcert(wildlands)!;
  const club = normalizeConcert(publicWorks)!;

  it('shows the artist you searched for, not the top of the bill', () => {
    // WILDLANDS bills John Summit first and Overmono tenth. Showing the first
    // name is the bug §5.6 already fixed once for JamBase, where searching
    // Overmono surfaced "Robyn" off the Portola lineup.
    expect(headlinerOf(fest, 'Overmono')).toBe('Overmono');
    expect(headlinerOf(club, 'Overmono')).toBe('Overmono');
  });

  it('matches the searched artist on a prefix too', () => {
    expect(headlinerOf(fest, 'nia arch')).toBe('Nia Archives');
  });

  it('leaves a festival headline-less when nothing was searched', () => {
    // Matches upsertJamBaseEvent: for a festival the event name is the label.
    expect(headlinerOf(fest)).toBeNull();
  });

  it('uses the first billed artist for a normal show', () => {
    expect(headlinerOf(club)).toBe('Overmono');
  });

  it('returns null when the lineup is empty', () => {
    const empty: SpotifyConcert = { ...club, artists: [] };
    expect(headlinerOf(empty)).toBeNull();
    expect(headlinerOf(empty, 'Overmono')).toBeNull();
  });
});

describe('withinRadius', () => {
  const SF = { lat: 37.7749, lng: -122.4194 };
  const publicWorksSF = normalizeConcert(publicWorks)!;   // 37.77, -122.42
  const perth = normalizeConcert(wildlands)!;             // -31.74, 115.76

  it('measures real distances', () => {
    // SF → Oakland is about 8.5 miles; SF → Perth is ~9,160 (great circle,
    // which runs shorter than the flight paths that quote ~11,000).
    expect(milesBetween(SF.lat, SF.lng, 37.8044, -122.2712)).toBeCloseTo(8.5, 0);
    expect(milesBetween(SF.lat, SF.lng, perth.lat!, perth.lng!)).toBeCloseTo(9_160, -2);
  });

  it('keeps a show in the requested city and drops one on another continent', () => {
    const kept = withinRadius([publicWorksSF, perth], SF.lat, SF.lng, 25);
    expect(kept.map((c) => c.venueName)).toEqual(['Public Works']);
  });

  it('respects the radius', () => {
    expect(withinRadius([publicWorksSF], SF.lat, SF.lng, 1)).toHaveLength(1);
    // Los Angeles is ~350 miles from SF: inside 400, outside 100.
    const la: SpotifyConcert = { ...publicWorksSF, lat: 34.0522, lng: -118.2437 };
    expect(withinRadius([la], SF.lat, SF.lng, 100)).toHaveLength(0);
    expect(withinRadius([la], SF.lat, SF.lng, 400)).toHaveLength(1);
  });

  it('drops rows with no coordinates rather than assuming they are nearby', () => {
    const placeless: SpotifyConcert = { ...publicWorksSF, lat: null, lng: null };
    expect(withinRadius([placeless], SF.lat, SF.lng, 5_000)).toHaveLength(0);
  });
});

/**
 * One call against the real API.
 *
 * Deliberately ONE — the free plan allows 1000 requests a *month*, so a chatty
 * live suite is a real cost. Gated on LIVE_TEST like the other live tests.
 *
 *   LIVE_TEST=1 RAPID_API_KEY=... npx vitest run test/spotifyconcerts.test.ts
 */
const live =
  process.env.LIVE_TEST === '1' && process.env.RAPID_API_KEY ? describe : describe.skip;

live('searchArtistConcerts (live)', () => {
  it('finds the SF club show that JamBase and Ticketmaster both miss', async () => {
    const { searchArtistConcerts } = await import('@/lib/providers/spotifyconcerts');
    const { artist, concerts, quotaRemaining } = await searchArtistConcerts('Overmono');

    expect(artist?.name).toBe('Overmono');
    expect(concerts.length).toBeGreaterThan(8);

    // Overmono DJ Set + Ben UFO at Public Works — the show TODO §5.7 cites as
    // absent from both other providers, and the reason manual entry exists.
    const sf = concerts.find((c) => c.city === 'San Francisco');
    expect(sf).toBeDefined();
    expect(sf!.venueName).toBe('Public Works');
    expect(sf!.region).toBe('CA');
    expect(sf!.lat).toBeCloseTo(37.77, 1);

    // Every row must carry a parseable instant and an id.
    for (const c of concerts) {
      expect(c.id).toMatch(/^[A-Za-z0-9]+$/);
      expect(Number.isNaN(Date.parse(c.startsAt))).toBe(false);
    }

    // Surfaced so a failing run says "you are out of quota" rather than 403.
    console.log(`RapidAPI quota remaining this month: ${quotaRemaining}`);
    expect(quotaRemaining === null || quotaRemaining > 0).toBe(true);
  }, 30_000);
});
