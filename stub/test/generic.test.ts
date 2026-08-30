import { describe, it, expect } from 'vitest';
import { runExtractors } from '@/lib/ingest/extractors';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { dedupeKey, mergeTickets } from '@/lib/ingest/dedupe';
import type { ParsedTicket } from '@/lib/types';

const mail = (over: Partial<{ from: string; subject: string; text: string }>) =>
  normalizeEmail({
    from: over.from ?? 'Tickets <orders@some-new-venue.com>',
    subject: over.subject ?? 'Your order confirmation',
    receivedAt: '2026-08-01T12:00:00Z',
    text: over.text ?? '',
  });

/**
 * The generic reader exists because ticketing is a long tail and the failure
 * mode for a missing spec is SILENCE — TicketWeb had one with no name
 * extraction and every confirmation was dropped with no error and no review
 * card. Turning "lost" into "queued for review" is the whole point.
 *
 * The asymmetry that sets the bar: a wrong review card costs one tap, a dropped
 * confirmation costs a show the user never learns was missed.
 */
describe('generic extractor', () => {
  it('reads a confirmation from a vendor with no spec at all', () => {
    const res = runExtractors(mail({
      from: 'Bloop Tickets <noreply@bloop-tickets.example>',
      subject: 'Your tickets for Jamie xx',
      text: `Thanks for your purchase.
Order Number: BLP-99182
Venue: The Warehouse, Oakland, CA
Saturday, November 14, 2026 at 9:00 PM
Total: $84.50`,
    }));

    expect(res?.extractor).toBe('generic');
    expect(res?.ticket.artistName).toBe('Jamie xx');
    expect(res?.ticket.startsAt).toBe('2026-11-14T21:00:00');
    expect(res?.ticket.ticketRef).toBe('BLP-99182');
    expect(res?.ticket.priceCents).toBe(8450);
  });

  it('requires the BODY to corroborate, not just the subject', () => {
    // A marketing blast can easily carry a transactional-sounding subject; what
    // it does not carry is an order number or a total.
    expect(runExtractors(mail({
      subject: 'Your tickets are here — Jamie xx on sale now!',
      text: `Tickets for Jamie xx go on sale Friday, November 14, 2026.
Set a reminder so you don't miss out. Unsubscribe.`,
    }))).toBeNull();
  });

  it('stays out of the way of retailers that sell nothing like a ticket', () => {
    expect(runExtractors(mail({
      from: 'Gap <orders@email.gapfactory.com>',
      subject: 'Order Confirmation #1P1S0X6',
      text: 'Order Number: 1P1S0X6\nTotal: $84.50\nShips by Friday, November 14, 2026',
    }))).toBeNull();
  });

  it('does not claim mail a real vendor extractor owns', () => {
    // AXS has a spec; the generic reader must not answer for it with a worse
    // parse just because the vendor pass declined.
    const res = runExtractors(mail({
      from: 'AXS <guestservices@axs.com>',
      subject: 'Your order confirmation',
      text: 'Order Number: 123456\nTotal: $10.00\nNovember 14, 2026 at 9:00 PM',
    }));
    expect(res?.extractor).not.toBe('generic');
  });

  it('will not store a sentence as an artist name', () => {
    const res = runExtractors(mail({
      from: 'Venue <noreply@some-room.example>',
      subject: 'Your tickets have been transferred',
      text: 'Order Number: X1\nTotal: $10.00\nNovember 14, 2026 at 9:00 PM',
    }));
    expect(res?.ticket.artistName).toBeUndefined();
  });
});

describe('dedupeKey — one show, several emails', () => {
  const base: ParsedTicket = { artistName: 'Fred Again', startsAt: '2026-01-31T19:00:00' };

  it('is stable across emails that disagree about the TIME', () => {
    /*
     * A purchase receipt and a delivery notice routinely carry different hours
     * — doors versus stage time — while agreeing on the night. Keying on the
     * time would defeat the whole thing.
     */
    const receipt = dedupeKey(base);
    const delivery = dedupeKey({ ...base, startsAt: '2026-01-31T22:30:00' });
    expect(receipt).toBe(delivery);
    expect(receipt).toBe('fredagain:2026-01-31');
  });

  it('normalises punctuation and case', () => {
    expect(dedupeKey({ artistName: 'Tegan & Sara', startsAt: '2026-06-23T20:00:00' }))
      .toBe(dedupeKey({ artistName: 'tegan and sara', startsAt: '2026-06-23T20:00:00' }));
  });

  it('separates two nights of the same residency', () => {
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, startsAt: '2026-02-01T19:00:00' }));
  });

  it('is null when it cannot fingerprint, rather than colliding', () => {
    // A candidate with no name or no date must still reach the review queue.
    expect(dedupeKey({ startsAt: '2026-01-31T19:00:00' })).toBeNull();
    expect(dedupeKey({ artistName: 'Fred Again' })).toBeNull();
    expect(dedupeKey({ artistName: '!!!', startsAt: '2026-01-31T19:00:00' })).toBeNull();
  });
});

describe('mergeTickets', () => {
  it('fills gaps from the later email without overwriting the first', () => {
    // The receipt has the price actually paid; the delivery notice adds the seat.
    const merged = mergeTickets(
      { artistName: 'Fred Again', priceCents: 60810, startsAt: '2026-01-31T19:00:00' },
      { artistName: 'Fred Again (21+)', seatInfo: 'GA', ticketQuantity: 2, priceCents: 999 },
    );
    expect(merged.priceCents).toBe(60810);
    expect(merged.artistName).toBe('Fred Again');
    expect(merged.seatInfo).toBe('GA');
    expect(merged.ticketQuantity).toBe(2);
  });

  it('ignores empty values rather than writing them over real ones', () => {
    const merged = mergeTickets(
      { artistName: 'Fred Again', venueName: 'East End Studios' },
      { venueName: '', ticketRef: undefined },
    );
    expect(merged.venueName).toBe('East End Studios');
  });
});
