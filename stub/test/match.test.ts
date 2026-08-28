import { describe, it, expect } from 'vitest';
import { similarity, scoreCandidate, AUTO_ADD_THRESHOLD } from '@/lib/ingest/match';
import type { TMEvent } from '@/lib/providers/ticketmaster';
import type { ParsedTicket } from '@/lib/types';

function tmEvent(over: Partial<TMEvent> & { artist?: string; venue?: string; city?: string; start?: string }): TMEvent {
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
