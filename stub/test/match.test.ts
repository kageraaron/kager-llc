import { describe, it, expect } from 'vitest';
import {
  similarity,
  scoreCandidate,
  fromTicketmaster,
  fromSpotify,
  sameShow,
  AUTO_ADD_THRESHOLD,
} from '@/lib/ingest/match';
import type { TMEvent } from '@/lib/providers/ticketmaster';
import type { ParsedTicket } from '@/lib/types';
import type { SpotifyConcert } from '@/lib/providers/spotifyconcerts';

/** Builds a Ticketmaster event and normalises it the way the matcher does. */
function tmEvent(over: Partial<TMEvent> & { artist?: string; venue?: string; city?: string; start?: string }) {
  return fromTicketmaster(tmRaw(over));
}

function tmRaw(over: Partial<TMEvent> & { artist?: string; venue?: string; city?: string; start?: string }): TMEvent {
  const { artist, venue, city, start, ...rest } = over;
  return {
    id: 'TM123',
    name: artist ?? 'Some Event',
    dates: { start: { dateTime: start ?? '2026-04-18T03:00:00Z' } },
    _embedded: {
      attractions: artist ? [{ id: 'A1', name: artist }] : undefined,
      venues: venue ? [{ id: 'V1', name: venue, city: { name: city } }] : undefined,
    },
    ...rest,
  };
}

describe('similarity', () => {
  it('is 1 for identical strings', () => {
    expect(similarity('Turnstile', 'Turnstile')).toBe(1);
  });

  it('ignores case, punctuation and leading articles', () => {
    expect(similarity('The Fillmore', 'fillmore')).toBe(1);
    expect(similarity('Fontaines D.C.', 'Fontaines DC')).toBeGreaterThan(0.9);
  });

  it('treats ampersand and "and" alike', () => {
    expect(similarity('Florence & the Machine', 'Florence and the Machine')).toBeGreaterThan(0.9);
  });

  it('separates genuinely different artists', () => {
    expect(similarity('Japanese Breakfast', 'Japandroids')).toBeLessThan(0.6);
  });
});

describe('scoreCandidate', () => {
  const ticket: ParsedTicket = {
    artistName: 'Japanese Breakfast',
    venueName: 'The Fillmore',
    city: 'San Francisco',
    startsAt: '2026-04-18T20:00:00-07:00',
  };

  it('returns full confidence on an exact Ticketmaster event id', () => {
    const res = scoreCandidate({ ...ticket, tmEventId: 'TM123' }, tmEvent({ artist: 'Whatever' }));
    expect(res.confidence).toBe(1);
    expect(res.reasons[0]).toMatch(/exact/i);
  });

  it('clears the auto-add bar when everything agrees', () => {
    const res = scoreCandidate(
      ticket,
      tmEvent({
        artist: 'Japanese Breakfast',
        venue: 'The Fillmore',
        city: 'San Francisco',
        start: '2026-04-19T03:00:00Z',
      }),
    );
    expect(res.confidence).toBeGreaterThanOrEqual(AUTO_ADD_THRESHOLD);
  });

  it('falls below the bar when the artist is wrong', () => {
    const res = scoreCandidate(
      ticket,
      tmEvent({
        artist: 'Parquet Courts',
        venue: 'The Fillmore',
        city: 'San Francisco',
        start: '2026-04-19T03:00:00Z',
      }),
    );
    expect(res.confidence).toBeLessThan(AUTO_ADD_THRESHOLD);
  });

  it('falls below the bar when the date is a week off', () => {
    const res = scoreCandidate(
      ticket,
      tmEvent({
        artist: 'Japanese Breakfast',
        venue: 'The Fillmore',
        city: 'San Francisco',
        start: '2026-04-26T03:00:00Z',
      }),
    );
    expect(res.confidence).toBeLessThan(AUTO_ADD_THRESHOLD);
  });

  // A ticket carrying only an artist name is not enough to silently add a show.
  it('caps confidence when very few fields were parsed', () => {
    const res = scoreCandidate(
      { artistName: 'Japanese Breakfast' },
      tmEvent({ artist: 'Japanese Breakfast' }),
    );
    expect(res.confidence).toBeLessThan(AUTO_ADD_THRESHOLD);
  });
});

describe('cross-provider candidates', () => {
  const ticket: ParsedTicket = {
    eventName: 'Silva Bumpa',
    venueName: 'Monarch',
    city: 'San Francisco',
    startsAt: '2026-09-27T22:00:00',
  };

  /** Shape a Spotify concert the way `fromSpotify` would. */
  const spotifyCandidate = (over: Partial<SpotifyConcert> = {}): SpotifyConcert => ({
    id: 'sp1',
    title: 'Silva Bumpa',
    // 22:00 PDT on the 27th IS 05:00 UTC on the 28th — the provider stores UTC.
    startsAt: '2026-09-28T05:00:00.000Z',
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
    venueName: 'Monarch',
    venueId: 'v1',
    lat: 37.77,
    lng: -122.42,
    isFestival: false,
    url: null,
    artists: ['Silva Bumpa'],
    lineup: [{ name: 'Silva Bumpa', spotifyArtistId: null, imageUrl: null }],
    ...over,
  });

  it('scores a Spotify club show highly even across the UTC date boundary', () => {
    const res = scoreCandidate(ticket, fromSpotify(spotifyCandidate(), 'Silva Bumpa'));
    expect(res.confidence).toBeGreaterThan(AUTO_ADD_THRESHOLD);
  });

  it('does not confuse a same-day festival at another venue for the club show', () => {
    // JamBase's only same-day San Francisco event for this artist is Portola at
    // Pier 80 — right date, right city, wrong show. It must not outrank Monarch.
    const portola = fromSpotify(
      spotifyCandidate({ id: 'sp2', title: 'Portola', venueName: 'Pier 80', venueId: 'v2' }),
      'Silva Bumpa',
    );
    const monarch = fromSpotify(spotifyCandidate(), 'Silva Bumpa');

    const scoredPortola = scoreCandidate(ticket, portola);
    const scoredMonarch = scoreCandidate(ticket, monarch);
    expect(scoredMonarch.confidence).toBeGreaterThan(scoredPortola.confidence);
  });

  describe('sameShow', () => {
    it('collapses the same gig reported by two providers', () => {
      // The good case for a cascade is that more than one provider has the
      // event. Without this, two strong scores read as "ambiguous" and the
      // ticket is pushed to review exactly when we are most confident.
      const fromTm = tmEvent({
        artist: 'Silva Bumpa',
        venue: 'Monarch',
        city: 'San Francisco',
        start: '2026-09-28T05:00:00Z',
      });
      const fromSp = fromSpotify(spotifyCandidate(), 'Silva Bumpa');
      expect(sameShow(fromTm, fromSp)).toBe(true);
    });

    it('keeps genuinely different shows apart', () => {
      const monarch = fromSpotify(spotifyCandidate(), 'Silva Bumpa');
      const portola = fromSpotify(
        spotifyCandidate({ id: 'sp2', title: 'Portola', venueName: 'Pier 80', artists: ['Portola'] }),
        'Portola',
      );
      expect(sameShow(monarch, portola)).toBe(false);
    });

    it('treats far-apart dates as different shows even at the same venue', () => {
      const night1 = fromSpotify(spotifyCandidate(), 'Silva Bumpa');
      const night2 = fromSpotify(
        spotifyCandidate({ id: 'sp3', startsAt: '2026-09-29T05:00:00.000Z' }),
        'Silva Bumpa',
      );
      expect(sameShow(night1, night2)).toBe(false);
    });
  });
});

describe('venue contradiction', () => {
  /**
   * Regression for a real auto-add of the WRONG event.
   *
   * An Eventbrite ticket for Silva Bumpa at Monarch, SF on 27 Sep matched
   * JamBase's "Portola" festival at Pier 80 Warehouse — same city, same night,
   * and a 100% artist match, because Silva Bumpa genuinely is on the Portola
   * bill. Venue was the only thing that disagreed, and at 0.12 weight it could
   * not stop a 0.876 score from crossing the 0.8 auto-add line.
   */
  const ticket: ParsedTicket = {
    eventName: 'Silva Bumpa',
    venueName: 'Monarch',
    city: 'San Francisco',
    startsAt: '2026-09-27T22:00:00',
  };

  it('caps a candidate whose venue disagrees, keeping it out of auto-add', () => {
    const portola = tmEvent({
      artist: 'Silva Bumpa',
      venue: 'Pier 80 Warehouse',
      city: 'San Francisco',
      start: '2026-09-27T03:00:00Z',
    });
    const res = scoreCandidate(ticket, portola);

    expect(res.confidence).toBeLessThan(AUTO_ADD_THRESHOLD);
    expect(res.reasons.join(' ')).toContain('venue contradicts');
  });

  it('leaves a matching venue untouched', () => {
    const monarch = tmEvent({
      artist: 'Silva Bumpa',
      venue: 'Monarch',
      city: 'San Francisco',
      start: '2026-09-28T05:00:00Z',
    });
    const res = scoreCandidate(ticket, monarch);

    expect(res.confidence).toBeGreaterThan(AUTO_ADD_THRESHOLD);
    expect(res.reasons.join(' ')).not.toContain('contradicts');
  });

  it('tolerates the same venue spelled differently', () => {
    // The cap must not fire on naming noise, only on genuine disagreement.
    const res = scoreCandidate(
      { ...ticket, venueName: 'The Fillmore' },
      tmEvent({ artist: 'Silva Bumpa', venue: 'Fillmore', city: 'San Francisco', start: '2026-09-28T05:00:00Z' }),
    );
    expect(res.reasons.join(' ')).not.toContain('contradicts');
  });

  it('does not penalise a candidate with no venue information', () => {
    // Absence of evidence is not evidence of absence.
    const res = scoreCandidate(ticket, tmEvent({ artist: 'Silva Bumpa', start: '2026-09-28T05:00:00Z' }));
    expect(res.reasons.join(' ')).not.toContain('contradicts');
  });
});

/**
 * The contradiction cap flattens every contradicted candidate to exactly 0.55,
 * which discards the information that one was a much better answer. With a
 * plain sort on `confidence` the winner is then decided by whatever order the
 * providers happened to return.
 *
 * That produced a real wrong answer in a live inbox: a Kaskade ticket for
 * "Shed A" on Apr 17 surfaced **Coachella, Indio, Apr 19** as the best match,
 * while Kaskade at Pier 48 on the exact date sat below it. Bandsintown simply
 * returned Coachella first.
 */
describe('ranking capped candidates', () => {
  const past = (venue: string, city: string, at: string) => ({
    id: venue,
    name: venue,
    artistName: null,
    startsAtLocal: at,
    venueName: venue,
    city,
    timezone: null,
    ticketUrl: null,
    eventUrl: null,
    lineup: [],
  });

  const ticket: ParsedTicket = {
    artistName: 'Kaskade',
    venueName: 'Shed A',
    startsAt: '2026-04-17T21:00:00',
  };

  const coachella = past('Coachella Festival Main Stage', 'Indio', '2026-04-19T20:00:00');
  const pier48 = past('Pier 48 - Lot #39', 'San Francisco', '2026-04-17T20:00:00');

  it('ranks the same-day show above a festival two days away', () => {
    const scored = [coachella, pier48]
      .map((c) => scoreCandidate(ticket, fromBandsintown(c, 'Kaskade')))
      .sort((a, b) => b.confidence - a.confidence || b.rawConfidence - a.rawConfidence);

    expect(scored[0].candidate.venueName).toBe('Pier 48 - Lot #39');
  });

  it('caps both, so neither can be added silently', () => {
    // Ranking better must not mean trusting more: the venue still contradicts.
    for (const c of [coachella, pier48]) {
      const r = scoreCandidate(ticket, fromBandsintown(c, 'Kaskade'));
      expect(r.confidence).toBe(0.55);
      expect(r.confidence).toBeLessThan(AUTO_ADD_THRESHOLD);
      expect(r.reasons).toContain('venue contradicts — capped');
    }
  });

  it('keeps the uncapped scores far enough apart to be a real signal', () => {
    const a = scoreCandidate(ticket, fromBandsintown(pier48, 'Kaskade'));
    const b = scoreCandidate(ticket, fromBandsintown(coachella, 'Kaskade'));
    expect(a.rawConfidence).toBeGreaterThan(b.rawConfidence + 0.05);
  });
});
