import { eventZone } from '@/lib/format';
import type { AttendanceWithEvent } from '@/lib/queries';

/**
 * "Year in review" — the stats a concert diary can produce and a discovery app
 * cannot.
 *
 * The differentiator is **spend**. Bandsintown and Songkick know what is on
 * sale; Banded and Concerts Remembered know what you logged by hand. None of
 * them knows what you PAID, because none of them reads your confirmation
 * emails. `price_cents` and `ticket_quantity` come off the receipt, so this can
 * answer "what did live music cost me this year" — which nothing else can.
 *
 * Deliberately a pure function over rows the caller already has. No queries, no
 * provider calls: `/archive` has fetched everything this needs, so a year
 * summary costs nothing beyond the arithmetic and is trivially testable.
 */

export interface YearStats {
  year: number;
  shows: number;
  /** Distinct headliners — the honest "artists seen" count. */
  artists: number;
  venues: number;
  cities: number;
  /** Null when no attendance in the year carried a price. */
  totalCents: number | null;
  /** Shows whose price we actually know, so the total can be shown honestly. */
  pricedShows: number;
  tickets: number | null;
  topArtist: { name: string; count: number } | null;
  topVenue: { name: string; count: number } | null;
  busiestMonth: { month: string; count: number } | null;
  /** Mean of the ratings given, or null if nothing was rated. */
  averageRating: number | null;
  ratedShows: number;
  newArtists: number;
  first: AttendanceWithEvent | null;
  last: AttendanceWithEvent | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The calendar year a show falls in, **in the venue's zone**, not the server's. */
export function yearOf(row: AttendanceWithEvent): number {
  const zone = eventZone(row.event);
  const opts: Intl.DateTimeFormatOptions = zone ? { timeZone: zone, year: 'numeric' } : { year: 'numeric' };
  return Number(new Date(row.event.starts_at).toLocaleDateString('en-US', opts));
}

/** Highest count, ties broken alphabetically so the output is stable. */
function top(counts: Map<string, number>): { name: string; count: number } | null {
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!best || count > best.count) best = { name, count };
  }
  return best;
}

/**
 * Summarise one year.
 *
 * `allRows` is the user's WHOLE history, not just the year — `newArtists` needs
 * to know whether an act had been seen before, which the year's rows alone
 * cannot say.
 */
export function summarizeYear(allRows: AttendanceWithEvent[], year: number): YearStats {
  const rows = allRows
    .filter((r) => yearOf(r) === year)
    .sort((a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime());

  const artists = new Map<string, number>();
  const venues = new Map<string, number>();
  const cities = new Set<string>();
  const months = new Map<string, number>();

  let totalCents = 0;
  let pricedShows = 0;
  let tickets = 0;
  let ticketedShows = 0;
  let ratingSum = 0;
  let ratedShows = 0;

  for (const row of rows) {
    const artist = row.event.headliner?.name || row.event.name;
    if (artist) artists.set(artist, (artists.get(artist) ?? 0) + 1);

    const venue = row.event.venue?.name;
    if (venue) venues.set(venue, (venues.get(venue) ?? 0) + 1);
    if (row.event.venue?.city) cities.add(row.event.venue.city.toLowerCase());

    const zone = eventZone(row.event);
    const monthIndex = new Date(row.event.starts_at).toLocaleDateString('en-US', {
      ...(zone ? { timeZone: zone } : {}),
      month: 'numeric',
    });
    const month = MONTHS[Number(monthIndex) - 1];
    if (month) months.set(month, (months.get(month) ?? 0) + 1);

    // Only count what we actually know. A missing price is not a free show, and
    // averaging over shows we have no receipt for would quietly understate it.
    if (row.price_cents != null) {
      totalCents += row.price_cents;
      pricedShows++;
    }
    if (row.ticket_quantity != null) {
      tickets += row.ticket_quantity;
      ticketedShows++;
    }
    if (row.rating != null) {
      ratingSum += row.rating;
      ratedShows++;
    }
  }

  // An act is "new" if this year holds the earliest show we have for them.
  const firstSeen = new Map<string, number>();
  for (const row of allRows) {
    const artist = row.event.headliner?.name || row.event.name;
    if (!artist) continue;
    const t = new Date(row.event.starts_at).getTime();
    const prior = firstSeen.get(artist);
    if (prior === undefined || t < prior) firstSeen.set(artist, t);
  }
  const newArtists = [...artists.keys()].filter((name) => {
    const earliest = firstSeen.get(name);
    return earliest !== undefined && new Date(earliest).getFullYear() === year;
  }).length;

  return {
    year,
    shows: rows.length,
    artists: artists.size,
    venues: venues.size,
    cities: cities.size,
    totalCents: pricedShows > 0 ? totalCents : null,
    pricedShows,
    tickets: ticketedShows > 0 ? tickets : null,
    topArtist: top(artists),
    topVenue: top(venues),
    busiestMonth: (() => {
      const best = top(months);
      return best ? { month: best.name, count: best.count } : null;
    })(),
    averageRating: ratedShows > 0 ? ratingSum / ratedShows : null,
    ratedShows,
    newArtists,
    first: rows[0] ?? null,
    last: rows[rows.length - 1] ?? null,
  };
}

/** Years the user has any history in, newest first. */
export function yearsWithShows(rows: AttendanceWithEvent[]): number[] {
  return [...new Set(rows.map(yearOf))].sort((a, b) => b - a);
}
