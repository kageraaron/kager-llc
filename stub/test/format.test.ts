import { describe, it, expect } from 'vitest';
import {
  eventZone,
  displayEventName,
  displayStatus,
  initials,
  formatEventTime,
  formatQuantity,
} from '@/lib/format';
import { inferTimezone, toInstant } from '@/lib/timezone';

/**
 * The regression these cover is a real bug report: a 10pm show at Monarch in
 * San Francisco displayed as "Mon, Sep 28 · 5:00 AM".
 *
 * The stored instant was correct — 22:00 PDT on the 27th IS 05:00 UTC on the
 * 28th. What was missing was a zone to render it in, and every one of these
 * helpers silently falls back to the RUNTIME's zone when it has none. Server
 * rendering on Vercel means that runtime zone is UTC.
 */

const monarch = {
  starts_at: '2026-09-28T05:00:00.000Z',
  timezone: null,
  venue: { timezone: null, region: 'CA', country: 'US' },
};

describe('eventZone', () => {
  it('prefers the zone stored on the event', () => {
    expect(eventZone({ timezone: 'America/New_York', venue: monarch.venue })).toBe('America/New_York');
  });

  it("falls back to the venue's zone when the event has none", () => {
    // Ticketmaster and JamBase both store a real IANA zone on the venue row, so
    // a Spotify-sourced event at a venue either of them has seen inherits it.
    expect(eventZone({ timezone: null, venue: { timezone: 'America/Los_Angeles', region: 'CA', country: 'US' } }))
      .toBe('America/Los_Angeles');
  });

  it('falls back to the region when neither row has a zone', () => {
    expect(eventZone(monarch)).toBe('America/Los_Angeles');
  });

  it('returns null when there is nothing to go on, rather than guessing', () => {
    expect(eventZone({ timezone: null, venue: null })).toBeNull();
    expect(eventZone({ timezone: null, venue: { timezone: null, region: null, country: null } })).toBeNull();
  });
});

describe('formatEventTime with a resolved zone', () => {
  it('renders a 10pm club show as 10pm, not 5am the next morning', () => {
    expect(formatEventTime(monarch.starts_at, eventZone(monarch))).toBe('10:00 PM');
  });

  it('reads as 5:00 AM in the zone a zone-less row would have fallen back to', () => {
    /*
     * Documented rather than desired. A zone-less row renders in the RUNTIME's
     * zone, which is UTC on Vercel — and this is what that produced. Asserted
     * against an explicit 'UTC' rather than `null`, so the test does not depend
     * on the zone the suite happens to run in.
     */
    expect(formatEventTime(monarch.starts_at, 'UTC')).toBe('5:00 AM');
  });
});

describe('inferTimezone', () => {
  it('maps US states', () => {
    expect(inferTimezone('CA', 'US')).toBe('America/Los_Angeles');
    expect(inferTimezone('NY')).toBe('America/New_York');
    expect(inferTimezone('tx')).toBe('America/Chicago');
  });

  it('disambiguates "CA" by country — California vs. Canada', () => {
    expect(inferTimezone('CA', 'US')).toBe('America/Los_Angeles');
    expect(inferTimezone('AB', 'CA')).toBe('America/Edmonton');
    // "CA" as a province code is not a province, so Canada has no answer here.
    expect(inferTimezone('CA', 'CA')).toBeNull();
  });

  it('resolves unambiguous province codes with no country given', () => {
    expect(inferTimezone('QC')).toBe('America/Toronto');
    expect(inferTimezone('BC')).toBe('America/Vancouver');
  });

  it('returns null rather than guessing for anything else', () => {
    expect(inferTimezone(null)).toBeNull();
    expect(inferTimezone('')).toBeNull();
    expect(inferTimezone('ZZ')).toBeNull();
    expect(inferTimezone('CA', 'GB')).toBeNull();
  });
});

describe('toInstant', () => {
  it('resolves a naive wall time against a zone', () => {
    expect(toInstant('2026-09-27T22:00:00', 'America/Los_Angeles')).toBe('2026-09-28T05:00:00.000Z');
    expect(toInstant('2026-01-15T20:00:00', 'America/New_York')).toBe('2026-01-16T01:00:00.000Z');
  });

  it('returns null without a zone, rather than inventing an instant', () => {
    expect(toInstant('2026-09-27T22:00:00', null)).toBeNull();
    expect(toInstant('not a date', 'America/Los_Angeles')).toBeNull();
  });
});

describe('displayEventName', () => {
  it('prefers the headliner over a whole-bill event title', () => {
    expect(displayEventName({ name: 'Silva Bumpa and Dean Turnley', headliner: { name: 'Silva Bumpa' } }))
      .toBe('Silva Bumpa');
  });

  it('falls through an empty artist name to the event name', () => {
    expect(displayEventName({ name: 'Outside Lands', headliner: { name: '' } })).toBe('Outside Lands');
    expect(displayEventName({ name: 'Outside Lands', headliner: null })).toBe('Outside Lands');
  });
});

describe('initials', () => {
  it('gives a two-letter monogram for the placeholder thumbnail', () => {
    expect(initials('Silva Bumpa')).toBe('SB');
    expect(initials('Overmono')).toBe('OV');
    expect(initials('A')).toBe('A');
  });

  it('uses the headliner rather than one letter from each act', () => {
    expect(initials('Silva Bumpa and Dean Turnley')).toBe('SB');
    expect(initials('Overmono b2b Ben UFO')).toBe('OV');
  });

  it('ignores punctuation and handles non-Latin names', () => {
    expect(initials('!!! (Chk Chk Chk)')).toBe('CC');
    expect(initials('Sigur Rós')).toBe('SR');
    expect(initials('   ')).toBe('?');
  });
});

describe('formatQuantity', () => {
  it('pluralises, and says nothing when the count is unknown', () => {
    expect(formatQuantity(1)).toBe('1 ticket');
    expect(formatQuantity(4)).toBe('4 tickets');
    expect(formatQuantity(null)).toBeNull();
    expect(formatQuantity(undefined)).toBeNull();
    expect(formatQuantity(0)).toBeNull();
  });
});

/**
 * `events.status` is provider data about TICKET AVAILABILITY, written once when
 * the event is first seen and never revisited. So a show from last spring still
 * claims to be "scheduled", which reads as a bug on an Archive card.
 *
 * Rewriting the column would be wrong — it is a faithful record of what the
 * provider said — so it is rendered conditionally instead.
 */
describe('displayStatus', () => {
  it('says nothing about availability once the show has happened', () => {
    // 11 past events in production said "scheduled". None of them were.
    expect(displayStatus('scheduled', true)).toBeNull();
    expect(displayStatus('onsale', true)).toBeNull();
    // "completed" is already implied by the card being in the Archive.
    expect(displayStatus('completed', true)).toBeNull();
  });

  it('keeps what still changes the meaning of the memory', () => {
    // Cancelled or postponed is the reason you did not go.
    expect(displayStatus('cancelled', true)).toBe('cancelled');
    expect(displayStatus('postponed', true)).toBe('postponed');
    expect(displayStatus('rescheduled', true)).toBe('rescheduled');
  });

  it('hides the unremarkable on upcoming shows too', () => {
    expect(displayStatus('onsale', false)).toBeNull();
    expect(displayStatus('scheduled', false)).toBeNull();
  });

  it('shows an unusual upcoming status rather than swallowing it', () => {
    expect(displayStatus('offsale', false)).toBe('offsale');
    expect(displayStatus('cancelled', false)).toBe('cancelled');
  });

  it('handles a missing status', () => {
    expect(displayStatus(null, true)).toBeNull();
    expect(displayStatus(undefined, false)).toBeNull();
  });
});
