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
