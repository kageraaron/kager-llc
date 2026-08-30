import { describe, it, expect } from 'vitest';
import { getEvent, isConfigured } from '@/lib/providers/eventbrite';

/**
 * Live check of the Eventbrite v3 API.
 *
 * Pins two things the implementation depends on and neither of which we
 * control: that an ARBITRARY public event is readable by id with an app token
 * (Eventbrite withdrew a lot of public access over the years, so this is not
 * safe to assume), and that public event SEARCH is gone — which is why this
 * provider answers "what is event 12345?" and is deliberately absent from
 * Browse.
 *
 * Skipped unless LIVE_TEST=1 and EVENTBRITE_API_KEY is set:
 *
 *   LIVE_TEST=1 npx vitest run test/live-eventbrite.test.ts
 */

const live = process.env.LIVE_TEST === '1' && isConfigured();

/** The Monarch booking from the original bug report. */
const SILVA_BUMPA = '1998116550390';

describe.skipIf(!live)('Eventbrite v3 API', () => {
  it('reads a public event by id, with the venue expanded', async () => {
    const ev = await getEvent(SILVA_BUMPA);

    expect(ev).not.toBeNull();
    expect(ev!.name).toBe('Silva Bumpa');
    expect(ev!.venueName).toBe('Monarch');
    expect(ev!.city).toBe('San Francisco');
    expect(ev!.region).toBe('CA');
  });

  it('reports a real IANA timezone', async () => {
    /*
     * The single most valuable field here. The confirmation email's own JSON-LD
     * says `"startDate": "2026-09-27 22:00:00"` — wall time, no zone — and the
     * Spotify proxy reports no zone at all. Only the vendor knows.
     */
    const ev = await getEvent(SILVA_BUMPA);
    expect(ev!.timezone).toBe('America/Los_Angeles');
    expect(ev!.startsAt).toBe('2026-09-28T05:00:00Z');
  });

  it('returns null for an id that is not an event, rather than throwing', async () => {
    await expect(getEvent('1')).resolves.toBeNull();
  });

  it('confirms public event search is gone', async () => {
    /*
     * If this ever stops being a 404, Eventbrite could answer "what is on near
     * me" and would be worth a place in Browse. Until then it is an
     * id-resolution provider only.
     */
    const res = await fetch('https://www.eventbriteapi.com/v3/events/search/?q=music', {
      headers: { Authorization: `Bearer ${process.env.EVENTBRITE_API_KEY}` },
    });
    expect(res.status).toBe(404);
  });

  it('has a rate limit generous enough to sit first in the cascade', async () => {
    const res = await fetch('https://www.eventbriteapi.com/v3/users/me/', {
      headers: { Authorization: `Bearer ${process.env.EVENTBRITE_API_KEY}` },
    });
    expect(res.status).toBe(200);

    // e.g. "token:ABC 9/2000 reset=3476s, key:XYZ 9/2000 reset=3476s"
    const limit = res.headers.get('x-rate-limit') ?? '';
    const cap = Number(/\d+\/(\d+)/.exec(limit)?.[1] ?? 0);
    expect(cap).toBeGreaterThanOrEqual(1000);
  });
});
