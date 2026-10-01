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
