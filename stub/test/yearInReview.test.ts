import { describe, it, expect } from 'vitest';
import { summarizeYear, yearsWithShows, yearOf } from '@/lib/yearInReview';
import type { AttendanceWithEvent } from '@/lib/queries';

/**
 * The spend figures are the point of this feature — they are the one statistic
 * no other concert app can produce, because they come off the confirmation
 * email rather than from anything the user typed. So the tests care most about
 * being *honest* with partial data: a missing price is not a free show.
 */

let seq = 0;
function row(over: {
  artist?: string;
  venue?: string;
  city?: string;
  at: string;
  timezone?: string | null;
  price?: number | null;
  tickets?: number | null;
  rating?: number | null;
}): AttendanceWithEvent {
  seq += 1;
  return {
    id: `a${seq}`,
    state: 'went',
    visibility: 'friends',
    source: 'gmail',
    ticket_ref: null,
    seat_info: null,
    price_cents: over.price ?? null,
    ticket_quantity: over.tickets ?? null,
    rating: over.rating ?? null,
    review: null,
    event: {
      id: `e${seq}`,
      tm_id: null,
      name: over.artist ?? 'Show',
      starts_at: over.at,
      timezone: over.timezone ?? 'America/Los_Angeles',
      image_url: null,
      url: null,
      status: 'onsale',
      venue: over.venue
        ? {
            id: `v${seq}`,
            name: over.venue,
            city: over.city ?? 'San Francisco',
            region: 'CA',
            country: 'US',
            timezone: 'America/Los_Angeles',
          }
        : null,
      headliner: over.artist ? { id: `ar${seq}`, name: over.artist, image_url: null } : null,
    },
  } as AttendanceWithEvent;
}

const history: AttendanceWithEvent[] = [
  row({ artist: 'Kaskade', venue: 'Pier 48', at: '2025-06-01T03:00:00Z', price: 5000, tickets: 2, rating: 4 }),
  row({ artist: 'Overmono', venue: 'Public Works', at: '2026-03-10T04:00:00Z', price: 7500, tickets: 1, rating: 5 }),
  row({ artist: 'Overmono', venue: 'Public Works', at: '2026-05-02T04:00:00Z', price: null, tickets: null, rating: 3 }),
  row({ artist: 'KETTAMA', venue: 'The Regency Ballroom', at: '2026-05-07T04:00:00Z', price: 4000, tickets: 2 }),
  row({ artist: 'Silva Bumpa', venue: 'Monarch', at: '2026-09-28T05:00:00Z', price: 5193, tickets: 1 }),
];

describe('summarizeYear', () => {
  const s = summarizeYear(history, 2026);

  it('counts shows, distinct artists, venues and cities', () => {
    expect(s.shows).toBe(4);
    // Overmono twice is one artist.
    expect(s.artists).toBe(3);
    expect(s.venues).toBe(3);
    expect(s.cities).toBe(1);
  });

  it('totals only what it has a receipt for, and says so', () => {
    /*
     * Three of the four 2026 shows carry a price. Averaging or totalling over
     * all four would quietly understate the year — a missing price is unknown,
     * not zero — so the denominator is reported alongside the total.
     */
    expect(s.totalCents).toBe(7500 + 4000 + 5193);
    expect(s.pricedShows).toBe(3);
    expect(s.shows).toBe(4);
  });

  it('reports null rather than zero when nothing has a price', () => {
    const free = summarizeYear([row({ artist: 'X', at: '2026-02-01T04:00:00Z' })], 2026);
    expect(free.totalCents).toBeNull();
    expect(free.tickets).toBeNull();
    expect(free.averageRating).toBeNull();
  });

  it('sums tickets across orders', () => {
    expect(s.tickets).toBe(1 + 2 + 1);
  });

  it('picks the most-seen artist and venue', () => {
    expect(s.topArtist).toEqual({ name: 'Overmono', count: 2 });
    expect(s.topVenue).toEqual({ name: 'Public Works', count: 2 });
  });

  it('averages only the ratings actually given', () => {
    // 5 and 3 in 2026; the unrated shows must not count as zero.
    expect(s.averageRating).toBe(4);
    expect(s.ratedShows).toBe(2);
  });

  it('counts an artist as new only in the year first seen', () => {
    // Kaskade was seen in 2025, so 2026's new acts are Overmono, KETTAMA and
    // Silva Bumpa — and Overmono counts once despite two 2026 shows.
    expect(s.newArtists).toBe(3);
    expect(summarizeYear(history, 2025).newArtists).toBe(1);
  });

  it('finds the bookends in chronological order', () => {
    expect(s.first?.event.headliner?.name).toBe('Overmono');
    expect(s.last?.event.headliner?.name).toBe('Silva Bumpa');
  });

  it('is empty, not broken, for a year with no shows', () => {
    const none = summarizeYear(history, 2019);
    expect(none.shows).toBe(0);
    expect(none.topArtist).toBeNull();
    expect(none.first).toBeNull();
  });
});

describe('year boundaries use the venue timezone', () => {
  it('files a New Year’s Eve show under the year it was actually played', () => {
    /*
     * 2026-01-01T04:00:00Z is 8pm on 31 December in San Francisco. Bucketing on
     * the stored instant would put a New Year's Eve gig in the wrong year —
     * the same class of bug as the 5 AM card.
     */
    const nye = row({ artist: 'NYE', venue: 'Monarch', at: '2026-01-01T04:00:00Z' });
    expect(yearOf(nye)).toBe(2025);
    expect(summarizeYear([nye], 2025).shows).toBe(1);
    expect(summarizeYear([nye], 2026).shows).toBe(0);
  });

  it('falls back to the venue region when no zone is stored', () => {
    const noZone = row({ artist: 'X', venue: 'Monarch', at: '2026-01-01T04:00:00Z', timezone: null });
    expect(yearOf(noZone)).toBe(2025);
  });
});

describe('yearsWithShows', () => {
  it('lists years newest first, without duplicates', () => {
    expect(yearsWithShows(history)).toEqual([2026, 2025]);
  });

  it('is empty for no history', () => {
    expect(yearsWithShows([])).toEqual([]);
  });
});

/**
 * The Upcoming and Archive pages both group by year using `yearOf`, so the
 * New Year's Eve case is the one worth pinning: a 9pm 31 December show in San
 * Francisco is stored as `2026-01-01T04:00:00Z`, and bucketing on the raw
 * instant files it under the following year.
 *
 * Archive had exactly that bug (`new Date(starts_at).getFullYear()`, which uses
 * the runtime zone — UTC on Vercel). Same fault as the 5 AM card, elsewhere.
 */
describe('year grouping for Upcoming and Archive', () => {
  const group = (rows: AttendanceWithEvent[]) => {
    const out: [number, AttendanceWithEvent[]][] = [];
    for (const r of rows) {
      const y = yearOf(r);
      const last = out[out.length - 1];
      if (last && last[0] === y) last[1].push(r);
      else out.push([y, [r]]);
    }
    return out;
  };

  it('keeps a New Year’s Eve show in the year it was played', () => {
    const grouped = group([
      row({ artist: 'A', venue: 'Monarch', at: '2026-12-15T04:00:00Z' }),
      row({ artist: 'B', venue: 'Monarch', at: '2027-01-01T04:00:00Z' }),
      row({ artist: 'C', venue: 'Monarch', at: '2027-03-02T04:00:00Z' }),
    ]);
    expect(grouped.map(([y, g]) => [y, g.length])).toEqual([[2026, 2], [2027, 1]]);
  });

  it('produces a single group when everything is in one year', () => {
    // Upcoming renders no divider at all in this case — a lone header above
    // every show is noise.
    const grouped = group([
      row({ artist: 'A', venue: 'Monarch', at: '2026-09-01T04:00:00Z' }),
      row({ artist: 'B', venue: 'Monarch', at: '2026-11-01T04:00:00Z' }),
    ]);
    expect(grouped).toHaveLength(1);
  });
});
