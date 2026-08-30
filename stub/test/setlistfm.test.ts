import { describe, it, expect } from 'vitest';
import { searchSetlists } from '@/lib/providers/setlistfm';
import { fromSetlistFm, scoreCandidate } from '@/lib/ingest/match';
import type { ParsedTicket } from '@/lib/types';
import { toSetlistDate } from '@/lib/providers/setlistfm';

describe('toSetlistDate', () => {
  it('uses the venue timezone, not the host timezone', () => {
    // 8pm Pacific on 18 Apr is already 19 Apr in UTC. setlist.fm files the show
    // under the local date, so the venue zone has to win.
    expect(toSetlistDate('2026-04-19T03:00:00Z', 'America/Los_Angeles')).toBe('18-04-2026');
    expect(toSetlistDate('2026-04-19T03:00:00Z', 'America/New_York')).toBe('18-04-2026');
    expect(toSetlistDate('2026-04-19T03:00:00Z', 'Asia/Tokyo')).toBe('19-04-2026');
  });

  it('falls back to UTC rather than the host timezone', () => {
    // Deterministic regardless of where this runs — the bug this guards against
    // only appears when the server and the developer are in different zones.
    expect(toSetlistDate('2026-04-19T03:00:00Z', null)).toBe('19-04-2026');
    expect(toSetlistDate('2026-04-19T03:00:00Z')).toBe('19-04-2026');
  });

  it('zero-pads single-digit days and months', () => {
    expect(toSetlistDate('2026-01-05T12:00:00Z', 'UTC')).toBe('05-01-2026');
  });
});

/**
 * setlist.fm as a MATCHER for past shows.
 *
 * Every listing provider answers "what is on sale", so a ticket for a show that
 * already happened matches nothing anywhere. setlist.fm is a database of gigs
 * that definitely happened, and it is free — so it goes ahead of Bandsintown's
 * past-events endpoint, which charges two credits for the same job.
 */
describe('searchSetlists / fromSetlistFm', () => {
  const kaskade = {
    id: 'abc123',
    eventDate: '17-04-2026',
    artist: { mbid: 'm1', name: 'Kaskade' },
    venue: {
      id: 'v1',
      name: 'Pier 48',
      city: {
        name: 'San Francisco',
        stateCode: 'CA',
        country: { code: 'US' },
        coords: { lat: 37.77, long: -122.39 },
      },
    },
    url: 'https://www.setlist.fm/setlist/kaskade/2026/pier-48.html',
  };

  it('turns a setlist into a scoreable candidate', () => {
    const c = fromSetlistFm(kaskade, 'Kaskade');
    expect(c.source).toBe('setlistfm');
    expect(c.artistName).toBe('Kaskade');
    expect(c.venueName).toBe('Pier 48');
    expect(c.city).toBe('San Francisco');
    // dd-MM-yyyy -> ISO, anchored at 20:00 local.
    expect(c.startsAt).toBe('2026-04-17T20:00:00');
  });

  it('beats the wrong festival on a real past ticket', () => {
    /*
     * The live failure: a Kaskade ticket for Apr 17 surfaced Coachella (Apr 19,
     * Indio) as its best match. setlist.fm has the actual show, on the exact
     * date, at Pier 48 — the venue the email's "Shed A" sits inside.
     */
    const ticket: ParsedTicket = {
      artistName: 'Kaskade',
      venueName: 'Shed A',
      startsAt: '2026-04-17T21:00:00',
    };
    const real = scoreCandidate(ticket, fromSetlistFm(kaskade, 'Kaskade'));
    const coachella = scoreCandidate(
      ticket,
      fromSetlistFm(
        {
          ...kaskade,
          id: 'x',
          eventDate: '19-04-2026',
          venue: { id: 'v2', name: 'Coachella Festival Main Stage', city: { name: 'Indio', stateCode: 'CA', country: { code: 'US' } } },
        },
        'Kaskade',
      ),
    );
    expect(real.rawConfidence).toBeGreaterThan(coachella.rawConfidence);
  });

  it('returns nothing rather than throwing for a blank artist or bad date', async () => {
    await expect(searchSetlists('', '2026-04-17T00:00:00')).resolves.toEqual([]);
    await expect(searchSetlists('Kaskade', 'not a date')).resolves.toEqual([]);
  });
});
