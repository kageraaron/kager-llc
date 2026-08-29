import { describe, it, expect } from 'vitest';
import {
  eventIdFromUrl,
  artistSlug,
  normalizeEvent,
  matchesQuery,
  toInstant,
  nearCity,
  withinDays,
  type BITEvent,
} from '@/lib/providers/bandsintown';

/**
 * Rows captured verbatim from the live API on 2026-08-29, trimmed to the fields
 * we read. Both are real cases, not invented ones.
 */

// The club show absent from BOTH Ticketmaster and JamBase — the case that
// justifies paying for a fourth provider at all.
const publicWorks = {
  title: 'Overmono @ Public Works',
  artist_name: 'Overmono',
  venue_name: 'Public Works',
  city: 'San Francisco',
  // Note: null even though the show is plainly in the US. The upstream never
  // populates this on artist rows, which is why `country` is not read anywhere.
  country: null,
  starts_at: '2026-09-27T22:00:00',
  event_url:
    'https://www.bandsintown.com/e/1040000560-overmono-at-public-works?came_from=251&utm_medium=web&utm_source=artist_page&utm_campaign=event',
  ticket_url:
    'https://www.bandsintown.com/e/1040000560-overmono-at-public-works?came_from=251&utm_medium=web&utm_source=artist_page&utm_campaign=ticket_rsvp',
  lineup: [],
};

const terminal5 = {
  title: 'Overmono @ Terminal 5',
  artist_name: 'Overmono',
  venue_name: 'Terminal 5',
  city: 'New York City',
  country: null,
  starts_at: '2026-10-09T19:00:00',
  event_url: 'https://www.bandsintown.com/e/108399484-overmono-at-terminal-5?came_from=251',
  ticket_url: null,
  lineup: [],
};

describe('eventIdFromUrl', () => {
  it('pulls the id out of an event URL', () => {
    expect(eventIdFromUrl(publicWorks.event_url)).toBe('1040000560');
  });

  // Past-event rows use /z/ rather than /e/ — same id, different path segment.
  it('handles the /z/ form used by past events', () => {
    expect(
      eventIdFromUrl('https://www.bandsintown.com/z/1035489321-drake-at-barclays-arena?came_from=251'),
    ).toBe('1035489321');
  });

  it('is null rather than throwing on junk', () => {
    expect(eventIdFromUrl(null)).toBeNull();
    expect(eventIdFromUrl('https://www.bandsintown.com/a/1488-drake')).toBeNull();
  });
});

describe('artistSlug', () => {
  it('builds the id-name form the artist endpoints require', () => {
    expect(artistSlug(1488, 'Drake')).toBe('1488-drake');
    expect(artistSlug(5399707, 'Overmono')).toBe('5399707-overmono');
  });

  it('collapses punctuation and spaces to single hyphens', () => {
    expect(artistSlug(1, 'Sunset Rollercoaster')).toBe('1-sunset-rollercoaster');
    expect(artistSlug(2, 'Mr. Elephant')).toBe('2-mr-elephant');
    expect(artistSlug(3, 'Godspeed You! Black Emperor')).toBe('3-godspeed-you-black-emperor');
  });

  it('strips diacritics rather than dropping the letters', () => {
    expect(artistSlug(4, 'Björk')).toBe('4-bjork');
  });
});

describe('normalizeEvent', () => {
  it('normalizes the Public Works row', () => {
    const ev = normalizeEvent(publicWorks);
    expect(ev).not.toBeNull();
    expect(ev!.id).toBe('1040000560');
    expect(ev!.venueName).toBe('Public Works');
    expect(ev!.city).toBe('San Francisco');
    // Kept as a NAIVE local string. Parsing this as UTC would move a 22:00 SF
    // show to 15:00 the same day.
    expect(ev!.startsAtLocal).toBe('2026-09-27T22:00:00');
    expect(ev!.timezone).toBeNull();
  });

  it('falls back to the ticket URL when there is no event URL', () => {
    const ev = normalizeEvent({ ...publicWorks, event_url: null });
    expect(ev!.id).toBe('1040000560');
  });

  it('drops a row with no usable id or start', () => {
    expect(normalizeEvent({ ...publicWorks, event_url: null, ticket_url: null })).toBeNull();
    expect(normalizeEvent({ ...publicWorks, starts_at: null })).toBeNull();
  });
});

describe('matchesQuery', () => {
  // The good case, and the reason this provider is worth having: a partial name
  // resolves, where Ticketmaster's whole-word matching returns nothing.
  it('accepts a forward prefix', () => {
    expect(matchesQuery('Overmo', 'Overmono')).toBe(true);
    expect(matchesQuery('chris l', 'Chris Lake')).toBe(true);
  });

  it('ignores case and punctuation', () => {
    expect(matchesQuery('the fratellis', 'The Fratellis')).toBe(true);
  });

  // The endpoint has no relevance floor — it answers with *something*. Without
  // this guard a nonsense query puts a confident wrong artist on screen.
  it('rejects a fuzzy miss that badly overruns the name', () => {
    expect(matchesQuery('zzzznotanartist', 'Zzz.')).toBe(false);
  });

  it('tolerates a query overrunning the name by a few characters', () => {
    expect(matchesQuery('radioheads', 'Radiohead')).toBe(true);
  });
});

describe('toInstant', () => {
  // 22:00 in San Francisco on 27 Sep 2026 is PDT (UTC-7), so 05:00Z the 28th.
  it('resolves a naive local time against an IANA zone', () => {
    expect(toInstant('2026-09-27T22:00:00', 'America/Los_Angeles')).toBe(
      '2026-09-28T05:00:00.000Z',
    );
  });

  it('honours the zone offset in force on that date, not today', () => {
    // 15 Jan is PST (UTC-8), one hour further out than the September case.
    expect(toInstant('2027-01-15T20:00:00', 'America/Los_Angeles')).toBe(
      '2027-01-16T04:00:00.000Z',
    );
  });

  it('is null without a zone — an instant cannot be invented', () => {
    expect(toInstant('2026-09-27T22:00:00', null)).toBeNull();
  });
});

// --------------------------------------------------------------- local filters

function ev(partial: Partial<BITEvent>): BITEvent {
  return {
    id: '1',
    name: 'Show',
    artistName: 'Overmono',
    startsAtLocal: '2026-09-27T22:00:00',
    venueName: 'Public Works',
    city: 'San Francisco',
    timezone: null,
    ticketUrl: null,
    eventUrl: null,
    lineup: [],
    ...partial,
  };
}

describe('nearCity', () => {
  const tour = [
    normalizeEvent(publicWorks)!,
    normalizeEvent(terminal5)!,
    ev({ id: '3', city: 'London', venueName: 'Alexandra Palace' }),
  ];

  it('narrows a worldwide tour to one city', () => {
    const hits = nearCity(tour, 'San Francisco');
    expect(hits).toHaveLength(1);
    expect(hits[0].venueName).toBe('Public Works');
  });

  it('matches on a substring so "New York" finds "New York City"', () => {
    expect(nearCity(tour, 'New York')).toHaveLength(1);
  });

  it('returns nothing for a city not on the tour', () => {
    expect(nearCity(tour, 'Reykjavik')).toHaveLength(0);
  });

  it('drops rows with no city rather than keeping them as maybes', () => {
    expect(nearCity([ev({ city: null })], 'San Francisco')).toHaveLength(0);
  });
});

describe('withinDays', () => {
  const tour = [normalizeEvent(publicWorks)!, normalizeEvent(terminal5)!];

  it('keeps only the date the ticket points at', () => {
    const hits = withinDays(tour, '2026-09-27T00:00:00Z', 2);
    expect(hits).toHaveLength(1);
    expect(hits[0].venueName).toBe('Public Works');
  });

  it('absorbs a local-date-with-no-zone off by a few hours', () => {
    // A ticket saying "28 Sep" still matches a show listed at 22:00 on the 27th.
    expect(withinDays(tour, '2026-09-28T00:00:00Z', 2)).toHaveLength(1);
  });

  it('keeps a row whose date is unparseable rather than silently dropping it', () => {
    const broken = [ev({ startsAtLocal: 'not a date' })];
    expect(withinDays(broken, '2026-09-27T00:00:00Z', 2)).toHaveLength(1);
  });
});
