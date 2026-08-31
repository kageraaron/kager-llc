/**
 * Payload for the TRMNL e-ink display plugin.
 *
 * TRMNL polls `/api/trmnl/<token>` and hands the JSON body to a Liquid template
 * as merge variables. Two constraints from that pipeline shape everything here:
 *
 * 1. **2KB.** TRMNL caps a polled payload at 2KB and there is no pagination to
 *    fall back on — an oversized response is rejected whole, so the display
 *    goes blank rather than degrading. `buildTrmnlPayload` therefore treats the
 *    limit as a budget it spends down, dropping the FURTHEST-OUT shows until the
 *    body fits. A truncated feed still shows the next show, which is the one
 *    that matters; `count` keeps the real total so the template can say "+3 more".
 *
 * 2. **Liquid can't format dates in a timezone.** The device renders whatever
 *    string it is given, so every date and time is pre-formatted HERE, in the
 *    venue's zone via `eventZone` — the same rule the web cards follow. Sending
 *    raw ISO instants would put a 10pm San Francisco show on the wall as 5:00 AM.
 */

import {
  displayEventName,
  eventZone,
  formatEventDate,
  formatEventTime,
  relativeDay,
} from '@/lib/format';

/**
 * The columns the feed actually reads.
 *
 * Structural rather than a re-use of `AttendanceWithEvent` so the route can
 * select six columns instead of twenty. `AttendanceWithEvent` satisfies it, so
 * anything already holding query rows can still be passed straight in.
 */
export interface TrmnlSourceRow {
  state: string;
  event: {
    name: string;
    starts_at: string;
    timezone?: string | null;
    headliner?: { name: string | null } | null;
    venue?: {
      name?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
      timezone?: string | null;
    } | null;
  };
}

/** TRMNL rejects a polled response larger than this. 5KB on TRMNL+, but the
 *  feed has to work on a free account, so the smaller number is the real one. */
export const TRMNL_PAYLOAD_LIMIT = 2048;

/**
 * Hard ceiling on rows, applied before the byte budget.
 *
 * The 800x480 panel fits roughly eight rows in the full-screen layout before
 * type has to shrink past comfortable reading distance, and a wall display is
 * read from across a room.
 *
 * In practice this is the constraint that binds: with the clip lengths below,
 * eight worst-case rows serialise to ~1.7KB, so the byte budget is a backstop
 * against a future field or a wider clip rather than the everyday limit.
 */
const MAX_SHOWS = 8;

/** Within this many days a show is marked `soon`, which the template emphasises. */
const SOON_DAYS = 7;

export interface TrmnlShow {
  /** Headliner where there is one, else the event title. Clipped to fit a row. */
  name: string;
  /** "Fri, Sep 4" — year appended only when it isn't the current one. */
  date: string;
  /** "9:00 PM", in the venue's zone. */
  time: string;
  venue: string;
  /** "San Francisco, CA". Empty when the venue row has no place on it. */
  city: string;
  /** "Tomorrow", "in 3 days". */
  when: string;
  /** True within a week — the template gives these a heavier weight. */
  soon: boolean;
  /** `interested` rather than `going`; rendered with a marker so the wall
   *  display never implies a ticket that was never bought. */
  maybe: boolean;
}

export interface TrmnlPayload {
  /** Every upcoming show, INCLUDING any the budget dropped. */
  count: number;
  /** How many made it into `shows`. Equal to `count` unless truncated. */
  shown: number;
  shows: TrmnlShow[];
  /** ISO instant, so the template can show when the panel last had fresh data. */
  generated_at: string;
}

/**
 * Clip to a column width the panel can actually render.
 *
 * Prefers a word boundary so "Wednesday Campanella" becomes "Wednesday…" rather
 * than "Wednesday Campan…" — a broken word reads as a rendering fault on a
 * display with no tooltip to recover the rest.
 */
function clip(value: string, max: number): string {
  const s = value.trim();
  if (s.length <= max) return s;

  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour the boundary if it doesn't cost most of the line.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,·-]+$/, '')}…`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function toShow(row: TrmnlSourceRow): TrmnlShow {
  const zone = eventZone(row.event);
  const venue = row.event.venue;
  const days = (new Date(row.event.starts_at).getTime() - Date.now()) / 86_400_000;

  return {
    name: clip(displayEventName(row.event), 40),
    date: formatEventDate(row.event.starts_at, zone),
    time: formatEventTime(row.event.starts_at, zone),
    venue: clip(venue?.name ?? '', 30),
    // Region is dropped before the city when space runs short: "San Francisco"
    // alone still locates a show for the person who bought the ticket.
    city: clip([venue?.city, venue?.region].filter(Boolean).join(', '), 24),
    when: relativeDay(row.event.starts_at),
    soon: days <= SOON_DAYS,
    maybe: row.state === 'interested',
  };
}

/**
 * Build the polled body from the user's upcoming attendances.
 *
 * `rows` is expected soonest-first (what `getUpcoming` returns); the byte budget
 * drops from the tail, so the ordering is what decides which shows survive.
 */
export function buildTrmnlPayload(
  rows: TrmnlSourceRow[],
  options: { limit?: number } = {},
): TrmnlPayload {
  const limit = options.limit ?? TRMNL_PAYLOAD_LIMIT;

  /*
   * One clock reading is not threaded through here on purpose. `soon`, `when`
   * (via `relativeDay`) and `generated_at` must agree, and `relativeDay` is a
   * shared helper that reads the wall clock itself — so an injectable `now` for
   * the other two would let them disagree with the string next to them on the
   * panel. Tests freeze time with `vi.setSystemTime` instead, which keeps all
   * three consistent by construction.
   */
  const shows = rows.slice(0, MAX_SHOWS).map(toShow);

  const payload: TrmnlPayload = {
    count: rows.length,
    shown: shows.length,
    shows,
    generated_at: new Date().toISOString(),
  };

  /*
   * Spend the budget down. Dropping one row at a time rather than estimating a
   * per-row cost keeps this exact regardless of how JSON escaping inflates a
   * particular name — an artist with a quote or an em dash in it costs more
   * bytes than its character count suggests.
   */
  while (payload.shows.length > 0 && byteLength(JSON.stringify(payload)) > limit) {
    payload.shows.pop();
    payload.shown = payload.shows.length;
  }

  return payload;
}
