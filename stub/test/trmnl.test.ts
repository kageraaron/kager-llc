import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildTrmnlPayload, TRMNL_PAYLOAD_LIMIT, type TrmnlSourceRow } from '@/lib/trmnl';

/**
 * The TRMNL feed has one failure mode that is worse than the others: TRMNL
 * rejects a polled payload over 2KB WHOLE, so an overspend doesn't drop a row,
 * it blanks the display. These cover the budget, and the timezone rule that the
 * web cards learned the hard way (see format.test.ts) — a wall panel showing a
 * 10pm show as 5:00 AM is a bug nobody reports, they just stop trusting it.
 */

const NOW = new Date('2026-09-01T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function show(overrides: Partial<TrmnlSourceRow['event']> & { state?: string } = {}): TrmnlSourceRow {
  const { state = 'going', ...event } = overrides;
  return {
    state,
    event: {
      name: 'Overmono',
      starts_at: '2026-09-04T03:00:00.000Z',
      timezone: 'America/Los_Angeles',
      venue: { name: 'The Midway', city: 'San Francisco', region: 'CA', country: 'US', timezone: null },
      headliner: null,
      ...event,
    },
  };
}

describe('buildTrmnlPayload', () => {
  it('pre-formats the date and time in the venue zone, not the runtime zone', () => {
    /*
     * The exact Monarch regression: 8pm PDT on Sep 3 IS 03:00 UTC on Sep 4.
     * Liquid cannot convert zones, so if this is wrong here it is wrong on the
     * panel forever. Vitest runs in the host zone, hence the explicit zone on
     * the fixture rather than a bare assertion about local time.
     */
    const [row] = buildTrmnlPayload([show()]).shows;
    expect(row.time).toBe('8:00 PM');
    expect(row.date).toBe('Thu, Sep 3');
  });

  it('falls back to the venue zone when the event row has none', () => {
    const [row] = buildTrmnlPayload([
      show({ timezone: null, venue: { name: 'The Midway', city: 'San Francisco', region: 'CA', country: 'US', timezone: 'America/Los_Angeles' } }),
    ]).shows;
    expect(row.time).toBe('8:00 PM');
  });

  it('prefers the headliner over a bill-shaped event title', () => {
    const [row] = buildTrmnlPayload([
      show({ name: 'Overmono and Special Guests', headliner: { name: 'Overmono' } }),
    ]).shows;
    expect(row.name).toBe('Overmono');
  });

  it('marks interested rows so the panel never implies a ticket', () => {
    const payload = buildTrmnlPayload([show({ state: 'interested' }), show()]);
    expect(payload.shows[0].maybe).toBe(true);
    expect(payload.shows[1].maybe).toBe(false);
  });

  it('flags shows within a week as soon', () => {
    const payload = buildTrmnlPayload([
      show({ starts_at: '2026-09-04T03:00:00.000Z' }),
      show({ starts_at: '2026-11-04T03:00:00.000Z' }),
    ]);
    expect(payload.shows[0].soon).toBe(true);
    expect(payload.shows[1].soon).toBe(false);
  });

  it('clips a long name on a word boundary rather than mid-word', () => {
    const [row] = buildTrmnlPayload([
      show({ name: 'Wednesday Campanella and the Very Long Support Bill' }),
    ]).shows;
    expect(row.name.length).toBeLessThanOrEqual(41); // 40 + the ellipsis
    expect(row.name.endsWith('…')).toBe(true);
    expect(row.name).not.toMatch(/\s…$/); // no dangling space before the ellipsis
  });

  it('fits a full screen of worst-case rows inside the 2KB budget', () => {
    /*
     * The clipping caps are what make this true: with names at 40 chars and
     * venues at 30, eight rows serialise to ~1.7KB, so MAX_SHOWS is the binding
     * constraint in practice and the byte budget is the backstop. If a future
     * change widens a cap or adds a field, this fails before the display does.
     */
    const rows = Array.from({ length: 8 }, (_, i) =>
      show({
        name: `Artist With A Fairly Long Touring Name ${i}`,
        venue: { name: 'A Venue With A Long Name Too', city: 'San Francisco', region: 'CA', country: 'US', timezone: null },
        starts_at: new Date(NOW.getTime() + (i + 1) * 86_400_000).toISOString(),
      }),
    );

    const payload = buildTrmnlPayload(rows);
    const size = new TextEncoder().encode(JSON.stringify(payload)).length;

    expect(size).toBeLessThanOrEqual(TRMNL_PAYLOAD_LIMIT);
    expect(payload.shown).toBe(8);
  });

  it('drops the furthest-out shows when the budget does bite', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      show({
        name: `Artist ${i}`,
        starts_at: new Date(NOW.getTime() + (i + 1) * 86_400_000).toISOString(),
      }),
    );

    // A deliberately tight limit, standing in for a future payload that grew.
    const payload = buildTrmnlPayload(rows, { limit: 600 });
    const size = new TextEncoder().encode(JSON.stringify(payload)).length;

    expect(size).toBeLessThanOrEqual(600);
    expect(payload.shows.length).toBeLessThan(rows.length);
    // Truncation comes off the tail, so the soonest show always survives.
    expect(payload.shows[0].name).toBe('Artist 0');
    expect(payload.count).toBe(8);
  });

  it('reports the true total even when truncated, so the template can say "+N"', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      show({ starts_at: new Date(NOW.getTime() + (i + 1) * 86_400_000).toISOString() }),
    );
    const payload = buildTrmnlPayload(rows);

    expect(payload.count).toBe(12);
    expect(payload.shown).toBe(payload.shows.length);
    expect(payload.shown).toBeLessThan(12);
  });

  it('accounts for JSON escaping, not character count, when spending the budget', () => {
    /*
     * A name full of quotes and backslashes doubles in size once serialised.
     * Estimating a per-row cost from `.length` would sail past the limit here.
     */
    const rows = Array.from({ length: 8 }, (_, i) =>
      show({
        name: '"\\Quote\\" ' + 'x'.repeat(25) + i,
        starts_at: new Date(NOW.getTime() + (i + 1) * 86_400_000).toISOString(),
      }),
    );
    const size = new TextEncoder().encode(JSON.stringify(buildTrmnlPayload(rows))).length;
    expect(size).toBeLessThanOrEqual(TRMNL_PAYLOAD_LIMIT);
  });

  it('returns an empty, well-formed payload when nothing is booked', () => {
    const payload = buildTrmnlPayload([]);
    expect(payload).toMatchObject({ count: 0, shown: 0, shows: [] });
    expect(payload.generated_at).toBe(NOW.toISOString());
  });

  it('tolerates a venue with no place on it', () => {
    const [row] = buildTrmnlPayload([show({ venue: null })]).shows;
    expect(row.venue).toBe('');
    expect(row.city).toBe('');
  });
});
