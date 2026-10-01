import { describe, it, expect } from 'vitest';
import { TICKET_SENDER_DOMAINS, registrableDomain } from '@/lib/ingest/extractors/vendors';
import { isTicketSender } from '@/lib/retention';

describe('ticket sender domains', () => {
  it('keeps country second-level domains whole', () => {
    expect(registrableDomain('mail.dice.fm')).toBe('dice.fm');
    expect(registrableDomain('moshtix.com.au')).toBe('moshtix.com.au');
    expect(registrableDomain('tickets.example.co.uk')).toBe('example.co.uk');
    expect(TICKET_SENDER_DOMAINS).not.toContain('com.au');
    expect(TICKET_SENDER_DOMAINS).toContain('moshtix.com.au');
  });
  it('does not treat an unrelated sender as a ticket seller', () => {
    expect(isTicketSender('Pharmacy <orders@chemist.com.au>')).toBe(false);
    expect(isTicketSender('Moshtix <no-reply@moshtix.com.au>')).toBe(true);
    expect(isTicketSender('AXS <tickets@email.axs.com>')).toBe(true);
  });
});

import { resolveStart } from '@/lib/providers/jambase';

describe('JamBase start times', () => {
  const at = (startDate: string, tz?: string) =>
    resolveStart({ startDate, location: tz ? { address: { 'x-timezone': tz } } : undefined } as never);

  it('reads a time without an offset as wall time at the venue', () => {
    // 8pm in San Francisco in October (PDT, UTC-7) is 03:00 UTC the next day.
    expect(at('2026-10-02T20:00:00', 'America/Los_Angeles')).toBe('2026-10-03T03:00:00.000Z');
    // ...and in January (PST, UTC-8) it is 04:00.
    expect(at('2027-01-03T16:00:00', 'America/Los_Angeles')).toBe('2027-01-04T00:00:00.000Z');
  });
  it('leaves a real instant alone', () => {
    expect(at('2026-10-03T03:00:00Z', 'America/Los_Angeles')).toBe('2026-10-03T03:00:00Z');
    expect(at('2026-10-02T20:00:00-07:00', 'America/Los_Angeles')).toBe('2026-10-02T20:00:00-07:00');
  });
  it('still anchors a date-only listing at 8pm local', () => {
    expect(at('2026-10-02', 'America/Los_Angeles')).toBe('2026-10-03T03:00:00.000Z');
  });
});
