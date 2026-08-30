import { describe, it, expect } from 'vitest';
import { runExtractors } from '@/lib/ingest/extractors';
import { normalizeEmail, contentHash } from '@/lib/ingest/normalize';
import {
  ticketmasterJsonLd,
  axsPlain,
  dicePlain,
  eventbriteJsonLd,
  marketingNoise,
  packageNoise,
  forwardedTicketmaster,
  axsOrderPresale,
  axsTransfer,
  seeTicketsGuestList,
  frontgateFestival,
  eventbriteSpacedStartDate,
  seeTicketsNoArtistInSubject,
  diceEventTitleSubject,
  eventbriteClubShow,
} from './fixtures/emails';

const run = (raw: Parameters<typeof normalizeEmail>[0]) => runExtractors(normalizeEmail(raw));

describe('JSON-LD extractor', () => {
  it('reads an EventReservation end to end', () => {
    const result = run(ticketmasterJsonLd);
    expect(result?.extractor).toBe('jsonld');

    const t = result!.ticket;
    expect(t.artistName).toBe('Japanese Breakfast');
    expect(t.venueName).toBe('The Fillmore');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    expect(t.startsAt).toBe('2026-04-18T20:00:00-07:00');
    expect(t.ticketRef).toBe('38-41225/SF3');
    expect(t.priceCents).toBe(12850);
    expect(t.currency).toBe('USD');
    expect(t.seatInfo).toContain('GA');
  });

  it('reads a bare Event node inside a JSON-LD array', () => {
    const result = run(eventbriteJsonLd);
    expect(result?.extractor).toBe('jsonld');

    const t = result!.ticket;
    expect(t.artistName).toBe('Sunset Rollercoaster');
    expect(t.venueName).toBe('Music Hall of Williamsburg');
    expect(t.city).toBe('Brooklyn');
    expect(t.startsAt).toBe('2026-08-09T19:00:00-04:00');
  });

  // JSON-LD must win outright, otherwise a vendor regex could override better data.
  it('takes precedence over the vendor extractor for the same sender', () => {
    expect(run(ticketmasterJsonLd)?.extractor).toBe('jsonld');
  });
});

describe('vendor extractors', () => {
  it('parses an AXS confirmation with no structured markup', () => {
    const result = run(axsPlain);
    expect(result?.extractor).toBe('axs');

    const t = result!.ticket;
    expect(t.artistName).toBe('Turnstile');
    expect(t.startsAt).toBe('2026-05-22T19:30:00');
    expect(t.ticketRef).toBe('AXS-99120B');
    expect(t.priceCents).toBe(9400);
  });

  it('parses a DICE confirmation using its labelled rows', () => {
    const result = run(dicePlain);
    expect(result?.extractor).toBe('dice');

    const t = result!.ticket;
    expect(t.artistName).toBe('Fontaines D.C.');
    expect(t.venueName).toBe('Brooklyn Steel');
    expect(t.startsAt).toBe('2026-06-14T20:00:00');
  });
});

describe('forwarded confirmations', () => {
  it('unwraps a forward and parses the original', () => {
    const result = run(forwardedTicketmaster);
    expect(result?.extractor).toBe('ticketmaster');

    const t = result!.ticket;
    expect(t.artistName).toBe('Moby');            // "(18+)" is venue metadata
    expect(t.startsAt).toBe('2026-11-05T19:00:00');
    expect(t.ticketRef).toBe('54-48418/NCA');     // not "Confirmed", not truncated
    expect(t.priceCents).toBe(19960);
  });

  it('is reachable by the Gmail query at all', async () => {
    const { buildTicketQuery } = await import('@/lib/providers/gmail');
    // A forward's sender is personal, so only the subject can match.
    expect(buildTicketQuery(30)).toMatch(/you got tickets/i);
  });
});

describe('rejection', () => {
  it('ignores marketing mail from a known ticket sender', () => {
    expect(run(marketingNoise)).toBeNull();
  });

  it('ignores a package shipping notice', () => {
    expect(run(packageNoise)).toBeNull();
  });
});

describe('content hashing', () => {
  it('is stable across identical emails', () => {
    expect(contentHash(normalizeEmail(axsPlain))).toBe(contentHash(normalizeEmail(axsPlain)));
  });

  it('differs between different emails', () => {
    expect(contentHash(normalizeEmail(axsPlain))).not.toBe(contentHash(normalizeEmail(dicePlain)));
  });
});

/**
 * Regressions from five real confirmations that ALL failed to parse.
 *
 * Every one was a distinct hole, not five instances of one bug:
 *  - AXS's real subjects matched no pattern, so its emails were never opened;
 *  - See Tickets had no field extraction at all, so it always returned null;
 *  - Frontgate had no extractor;
 *  - the event date lived only in the HTML part on AXS purchases;
 *  - "Sub Total" beat "Grand Total" in the price scan.
 */
describe('real-world vendor emails', () => {
  it('AXS purchase: reads the HTML order line, not the plain-text stub', () => {
    const result = run(axsOrderPresale);
    expect(result?.extractor).toBe('axs');

    const t = result!.ticket;
    // The event is 27 Feb; the ORDER was placed 27 Jan. Getting this wrong is
    // the whole point of the fixture — the order date appears first and in the
    // text part, which is what a naive scan reaches for.
    expect(t.startsAt).toBe('2026-02-27T18:00:00');
    expect(t.artistName).toBe('Chris Stussy');   // " - Presale" stripped
    expect(t.venueName).toBe('Shed A');
    expect(t.ticketRef).toBe('40000000');
    // Grand Total, not the $240.00 Sub Total sitting above it.
    expect(t.priceCents).toBe(31164);
    expect(t.ticketQuantity).toBe(4);
    expect(t.currency).toBe('USD');
  });

  it('AXS transfer: a gifted ticket is still a show you are going to', () => {
    const result = run(axsTransfer);
    expect(result?.extractor).toBe('axs');

    const t = result!.ticket;
    expect(t.artistName).toBe('Chris Lake');     // " - Admissions" stripped
    expect(t.startsAt).toBe('2026-05-02T20:00:00');
    expect(t.venueName).toBe('Shed A');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    // No order number or price on a transfer, and that must not disqualify it.
    expect(t.ticketRef).toBeUndefined();
    expect(t.priceCents).toBeUndefined();
    expect(t.ticketQuantity).toBe(3);
  });

  it('See Tickets: guest-list confirmation with a labelled block', () => {
    const result = run(seeTicketsGuestList);
    expect(result?.extractor).toBe('seetickets');

    const t = result!.ticket;
    expect(t.artistName).toBe('Shiba San');
    expect(t.venueName).toBe('1015 Folsom');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    // Door time is a couple of lines below the date and has to be stitched on.
    expect(t.startsAt).toBe('2026-05-08T22:00:00');
    expect(t.ticketRef).toBe('AA0BB1CCDDEE2F');
  });

  it('Frontgate: a multi-day festival files under its first day', () => {
    const result = run(frontgateFestival);
    expect(result?.extractor).toBe('frontgate');

    const t = result!.ticket;
    expect(t.eventName).toBe('Outside Lands');
    expect(t.venueName).toBe('Golden Gate Park');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    expect(t.startsAt).toBe('2026-08-07T00:00:00');
    expect(t.ticketRef).toBe('100000000');
    // $1037.95 total, not the $1018.00 "Event Subtotal".
    expect(t.priceCents).toBe(103795);
    expect(t.ticketQuantity).toBe(2);
  });
});

/**
 * A second batch of real confirmations. Three more shapes, three more holes.
 */
describe('real-world vendor emails, batch 2', () => {
  it('Eventbrite: repairs a startDate with a space instead of a T', () => {
    const result = run(eventbriteSpacedStartDate);
    expect(result?.extractor).toBe('jsonld');

    const t = result!.ticket;
    // Real Eventbrite output is "2024-06-23 14:00:00" — parseable by V8, but
    // not valid ISO 8601 and inconsistent with every other extractor.
    expect(t.startsAt).toBe('2024-06-23T14:00:00');
    expect(Number.isNaN(Date.parse(t.startsAt!))).toBe(false);

    expect(t.eventName).toBe('Stern Grove Festival Featuring: Tegan and Sara with King Isis');
    expect(t.venueName).toContain('Rhoda Goldman Concert Meadow');
    expect(t.city).toBe('San Francisco');
    expect(t.ticketRef).toBe('9000000000');
  });

  it('See Tickets: takes the headliner from the bill, not the boilerplate subject', () => {
    const result = run(seeTicketsNoArtistInSubject);
    expect(result?.extractor).toBe('seetickets');

    const t = result!.ticket;
    // The bug this guards: the subject is "Here Are Your Tickets", and the
    // subject-stripping path handed that back verbatim as the artist name.
    expect(t.artistName).toBe('Mipso');
    expect(t.artistName).not.toContain('Your Tickets');
    // Emphasis markers from the text/plain alternative must not survive.
    expect(t.artistName).not.toContain('*');

    expect(t.venueName).toBe('Great American Music Hall');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    // "Doors 8:00PM | Show 9:00PM" — the SHOW time, not doors.
    expect(t.startsAt).toBe('2024-02-17T21:00:00');
  });

  it('DICE: matches on sender alone, and resolves a date with no year', () => {
    const result = run(diceEventTitleSubject);
    expect(result?.extractor).toBe('dice');

    const t = result!.ticket;
    expect(t.eventName).toBe('SLOTHACID TOUR: SACHA ROBOTTI + TRUTH X LIES');
    // Headliner pulled out of a "TOUR: A + B" title so the matcher has an artist.
    expect(t.artistName).toBe('SACHA ROBOTTI');
    expect(t.venueName).toBe('Halcyon SF');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    // "Sat 01 Oct,10:00 PM" carries no year; the received date supplies 2022.
    expect(t.startsAt).toBe('2022-10-01T22:00:00');
    // Labelled "Price", which is not a total-shaped label.
    expect(t.priceCents).toBe(7026);
  });

  it('does not invent an artist from a boilerplate subject', () => {
    // Guards the general rule, independent of any one vendor.
    const stripped = run({
      ...seeTicketsNoArtistInSubject,
      text: 'Here are your tickets.\n\nNo event details at all.',
    });
    expect(stripped).toBeNull();
  });
});

describe('the club show that no aggregator lists', () => {
  it('parses cleanly even though nothing will match it', () => {
    // Ticketmaster returns zero candidates for this. The extractor still has to
    // produce a complete ticket, because that parse is what the "Add it anyway"
    // button in the Inbox builds the event from.
    const t = run(eventbriteClubShow)!.ticket;
    expect(t.eventName).toBe('Silva Bumpa');
    expect(t.venueName).toBe('Monarch');
    expect(t.city).toBe('San Francisco');
    expect(t.region).toBe('CA');
    expect(t.startsAt).toBe('2026-09-27T22:00:00');
    expect(t.ticketRef).toBe('15000000000');

    // Enough to create the show by hand: a name and a date.
    expect(t.artistName ?? t.eventName).toBeTruthy();
    expect(t.startsAt).toBeTruthy();
  });
});

/**
 * Subjects that are prose about tickets, not the name of an act.
 *
 * A real AXS delivery notice — "Your tickets were delivered to your account!" —
 * was being stored as `artistName`, verbatim. The old guard was anchored at both
 * ends, so it only rejected a subject that was EXACTLY boilerplate; anything
 * that started with boilerplate and kept going sailed through.
 *
 * The cost was threefold: the matcher searched every provider for an artist by
 * that sentence (spending metered quota to find nothing), the candidate could
 * never match, and "Add it anyway" would have created a junk artist row that
 * then degrades name matching for every ticket after it.
 */
describe('sentence subjects are not artist names', () => {
  const axs = (subject: string, body: string) =>
    runExtractors(
      normalizeEmail({
        from: 'AXS Guest Services <guestservices@axs.com>',
        subject,
        receivedAt: '2026-04-10T12:00:00Z',
        text: body,
        html: `<html><body><p>${subject}</p></body></html>`,
      }),
    );

  it('rejects a delivery notice rather than storing the sentence as an artist', () => {
    const out = axs(
      'Your tickets were delivered to your account!',
      'Your tickets were delivered to your account!\n\nFri Apr 17, 2026 - 9:00 PM\n\nSign in to the AXS app.',
    );
    /*
     * Nothing at all is the right answer here, not a nameless candidate: the
     * ORDER confirmation for the same show carries the artist and venue, so
     * this notice adds no information and would only duplicate the review queue.
     */
    expect(out).toBeNull();
  });

  it('rejects the other prose shapes vendors use', () => {
    for (const subject of [
      'Your tickets have been transferred',
      'Your order is confirmed',
      'Reminder: your event is coming up',
      'Thank you for your purchase',
      "Don't forget — your show starts tomorrow",
    ]) {
      const out = axs(subject, 'Fri Apr 17, 2026 - 9:00 PM');
      expect(out?.ticket.artistName, subject).toBeUndefined();
    }
  });

  it('still reads a real artist out of a real subject', () => {
    // The guard must not cost us the case it exists to serve.
    const out = axs(
      'Thank you for your order for Chris Stussy -  Presale',
      'Order details for Chris Stussy - Presale at Shed A scheduled on 2/27/2027 6:00 PM',
    );
    expect(out?.ticket.artistName).toBe('Chris Stussy');
  });
});
