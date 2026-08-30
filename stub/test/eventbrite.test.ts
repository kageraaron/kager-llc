import { describe, it, expect } from 'vitest';
import { eventIdFromText, normalizeEvent } from '@/lib/providers/eventbrite';
import { fromEventbrite, scoreCandidate, AUTO_ADD_THRESHOLD } from '@/lib/ingest/match';
import type { ParsedTicket } from '@/lib/types';

/**
 * The Monarch booking, captured verbatim from the live API on 2026-08-29 and
 * trimmed to the fields we read. This is the event behind the original bug
 * report, and Eventbrite is the only source that gets every part of it right.
 */
const monarch = {
  id: '1998116550390',
  name: { text: 'Silva Bumpa' },
  url: 'https://www.eventbrite.com/e/silva-bumpa-tickets-1998116550390',
  start: {
    local: '2026-09-27T22:00:00',
    utc: '2026-09-28T05:00:00Z',
    timezone: 'America/Los_Angeles',
  },
  end: { local: '2026-09-28T03:00:00', utc: '2026-09-28T10:00:00Z' },
  status: 'live',
  online_event: false,
  logo: { original: { url: 'https://img.evbuc.com/original.jpg' } },
  venue: {
    id: '270000000',
    name: 'Monarch',
    address: {
      city: 'San Francisco',
      region: 'CA',
      country: 'US',
      latitude: '37.7809861',
      longitude: '-122.4085',
    },
  },
};

describe('eventIdFromText', () => {
  it('pulls the id out of a slugged event link', () => {
    expect(eventIdFromText('https://www.eventbrite.com/e/silva-bumpa-tickets-1998116550390'))
      .toBe('1998116550390');
  });

  it('handles a bare id, other TLDs, and trailing query strings', () => {
    expect(eventIdFromText('https://www.eventbrite.com/e/1998116550390')).toBe('1998116550390');
    expect(eventIdFromText('https://www.eventbrite.co.uk/e/some-show-tickets-123456789012?aff=x'))
      .toBe('123456789012');
  });

  it('finds a link a bulk sender wrapped in a click tracker', () => {
    // Real confirmation mail routes every link through a redirector, so the
    // only surviving copy of the URL is percent-encoded inside a parameter.
    const wrapped =
      'https://click.eventbrite.com/f/a/xyz/?url=https%3A%2F%2Fwww.eventbrite.com%2Fe%2Fsilva-bumpa-tickets-1998116550390';
    expect(eventIdFromText(wrapped)).toBe('1998116550390');
  });

  it('does not invent an id from unrelated text', () => {
    expect(eventIdFromText('https://www.eventbrite.com/d/ca--san-francisco/music/')).toBeUndefined();
    expect(eventIdFromText('Order #15523346783 confirmed')).toBeUndefined();
    expect(eventIdFromText('')).toBeUndefined();
  });

  it('survives a malformed percent escape rather than throwing', () => {
    // `decodeURIComponent` throws on a lone '%'; a confirmation email is not a
    // place to be strict about that.
    expect(() => eventIdFromText('100% guaranteed seats')).not.toThrow();
    expect(eventIdFromText('100% guaranteed seats')).toBeUndefined();
  });
});

describe('normalizeEvent', () => {
  it('keeps the real IANA timezone — the whole reason this provider exists', () => {
    // The Spotify path stored `timezone: null` here, which is what rendered a
    // 10pm show as "Mon, Sep 28 · 5:00 AM".
    const ev = normalizeEvent(monarch)!;
    expect(ev.timezone).toBe('America/Los_Angeles');
    expect(ev.startsAt).toBe('2026-09-28T05:00:00Z');
  });

  it('takes the vendor’s own event name, in English', () => {
    // Compare with the Spotify proxy, which titles the same show
    // "Silva Bumpa y Dean Turnley".
    expect(normalizeEvent(monarch)!.name).toBe('Silva Bumpa');
  });

  it('carries the venue, coordinates and artwork through', () => {
    const ev = normalizeEvent(monarch)!;
    expect(ev.venueName).toBe('Monarch');
    expect(ev.city).toBe('San Francisco');
    expect(ev.region).toBe('CA');
    expect(ev.lat).toBeCloseTo(37.7809861);
    expect(ev.lng).toBeCloseTo(-122.4085);
    expect(ev.imageUrl).toBe('https://img.evbuc.com/original.jpg');
    expect(ev.isOnline).toBe(false);
  });

  it('falls back to local wall time when utc is absent', () => {
    const noUtc = { ...monarch, start: { local: '2026-09-27T22:00:00', timezone: 'America/Los_Angeles' } };
    expect(normalizeEvent(noUtc)!.startsAt).toBe('2026-09-27T22:00:00Z');
  });

  it('drops a row with no id or no start rather than storing NaN', () => {
    expect(normalizeEvent({ ...monarch, id: undefined })).toBeNull();
    expect(normalizeEvent({ ...monarch, start: undefined })).toBeNull();
  });

  it('tolerates an event with no venue at all', () => {
    const ev = normalizeEvent({ ...monarch, venue: null })!;
    expect(ev.venueName).toBeNull();
    expect(ev.lat).toBeNull();
  });
});

describe('scoring an Eventbrite candidate', () => {
  it('is decisive when the id came from the email', () => {
    /*
     * This is not a match in the usual sense. The candidate was FETCHED BY the
     * id the confirmation carried, so the only question is whether the id round
     * -tripped — and if it did, the company that sold the ticket has told us
     * what the ticket is for.
     */
    const ticket: ParsedTicket = { ebEventId: '1998116550390', eventName: 'Silva Bumpa' };
    const res = scoreCandidate(ticket, fromEventbrite(normalizeEvent(monarch)!));

    expect(res.confidence).toBe(1);
    expect(res.reasons).toContain('exact Eventbrite event id');
    expect(res.confidence).toBeGreaterThan(AUTO_ADD_THRESHOLD);
  });

  it('scores on the merits when the ids disagree', () => {
    // A stale or mistyped id must not shortcut its way to certainty.
    const ticket: ParsedTicket = { ebEventId: '999', eventName: 'Silva Bumpa' };
    const res = scoreCandidate(ticket, fromEventbrite(normalizeEvent(monarch)!));
    expect(res.confidence).toBeLessThan(1);
  });
});
