import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { isBoilerplateTitle, readTicket, secondOpinion } from '@/lib/ingest/extractors/read';
import { looseExtract } from '@/lib/ingest/extractors/loose';
import { runExtractors } from '@/lib/ingest/extractors';
import * as fixtures from './fixtures/emails';

/**
 * The second pass. Each case is a mistake seen in real mail, rebuilt with
 * made-up names: the parser's read on the left, what the loose reader does
 * about it on the right.
 */

const email = (over: Partial<Parameters<typeof normalizeEmail>[0]>) =>
  normalizeEmail({ from: 'Seller <no-reply@stubhub.com>', subject: 'x', receivedAt: '2026-06-24T17:00:00Z', text: '', ...over });

describe('telling a title from a sentence', () => {
  it('rejects the email talking', () => {
    for (const t of [
      'Pat, View and Save Your Tickets',
      'Your Tickets are No Longer for Sale',
      'Your tickets: NORTH ATLAS SOUND',
      "Confirmed - you're going to North Atlas Sound",
      'Pat, Your Ticket Transfer To Sam Went Through',
      '8:00 PM',
      undefined,
    ]) {
      expect(isBoilerplateTitle(t), String(t)).toBe(true);
    }
  });

  it('keeps bands whose names start like a sentence', () => {
    for (const t of ['We Are Scientists', 'You Me At Six', 'Thank You Scientist', 'Yes', 'Here Come the Mummies', 'Success', 'Confirmed Kills']) {
      expect(isBoilerplateTitle(t), t).toBe(false);
    }
  });
});

describe('second opinion on a parser read', () => {
  const loose = { artistName: 'North Atlas Sound', alternates: ['North Atlas Sound Live'], startsAt: '2026-08-07T21:30:00' };

  it('replaces a sentence with the act the loose reader found', () => {
    const r = secondOpinion({ artistName: 'Your tickets: NORTH ATLAS SOUND', startsAt: '2026-08-07T21:30:00' }, loose, email({}));
    expect(r?.ticket.artistName).toBe('North Atlas Sound');
    expect(r?.changed).toContain('title');
  });

  it('drops the read when neither reader has an act or a venue', () => {
    expect(secondOpinion({ artistName: 'Pat, View and Save Your Tickets', startsAt: '2026-08-04T19:00:00' }, null, email({}))).toBeNull();
  });

  it('keeps a venue-and-date read when only the title was a sentence', () => {
    const r = secondOpinion({ artistName: 'Here are your tickets', venueName: 'Bayside Arena', startsAt: '2026-08-07T21:30:00' }, null, email({}));
    expect(r?.ticket.artistName).toBeUndefined();
    expect(r?.ticket.venueName).toBe('Bayside Arena');
  });

  it('moves a show dated the day it was bought to the date in the email', () => {
    // Bought 24 June; the parser dated the show 24 June; the email says 7 August.
    const r = secondOpinion({ artistName: 'North Atlas Sound', startsAt: '2026-06-24T00:00:00' }, loose, email({}));
    expect(r?.ticket.startsAt).toBe('2026-08-07T21:30:00');
  });

  it('leaves a date alone when the parser and the loose reader merely differ', () => {
    // The parsers are right about dates far more often; only the order-date mistake is repaired.
    const r = secondOpinion({ artistName: 'North Atlas Sound', startsAt: '2026-11-13T20:00:00' }, { ...loose, startsAt: '2026-06-25T12:00:00' }, email({}));
    expect(r?.ticket.startsAt).toBe('2026-11-13T20:00:00');
  });

  it('separates a venue from the city attached to it', () => {
    const r = secondOpinion({ artistName: 'North Atlas Sound', venueName: 'The Lantern Theatre &mdash; San Francisco, California', startsAt: '2026-09-27T20:00:00' }, null, email({}));
    expect(r?.ticket).toMatchObject({ venueName: 'The Lantern Theatre', city: 'San Francisco', region: 'California' });
  });

  it('hands the matcher the loose reader\'s other readings', () => {
    const r = secondOpinion({ artistName: 'North Atlas Sound', startsAt: '2026-08-07T21:30:00' }, loose, email({}));
    expect(r?.ticket.alternates).toEqual(['North Atlas Sound Live']);
  });
});

describe('mail no parser reads', () => {
  /** A resale site's "tickets are ready" notice: a layout with no parser. */
  const ready = email({
    subject: 'Your tickets are ready - order# 600700800',
    receivedAt: '2026-05-05T17:00:00Z',
    html: `<p>StubHub</p><p>Hi Pat,</p><p>Good news! Your tickets are ready.</p><p>Order # 600700800</p>
<p>North Atlas Sound</p><p>Saturday, June 6, 2026 | 21:00</p><p>Lantern Theater, Oakland, CA</p><p>2 Ticket(s)</p>`,
  });

  it('is read loosely, and only ever as a card to review', () => {
    const r = readTicket(ready);
    expect(r).toMatchObject({ extractor: 'loose', reviewOnly: true });
    expect(r?.ticket).toMatchObject({ artistName: 'North Atlas Sound', venueName: 'Lantern Theater', startsAt: '2026-06-06T21:00:00' });
  });

  it('can be switched off', () => {
    process.env.STUB_LOOSE_FALLBACK = 'off';
    expect(readTicket(ready)).toBeNull();
    delete process.env.STUB_LOOSE_FALLBACK;
  });

  it('is not read at all when it is about a ticket the reader does not hold', () => {
    for (const subject of [
      'Success! You confirmed your ticket transfer for Sale #600700800',
      'Your ticket transfer for North Atlas Sound (18+) is on its way to Sam',
      'Your tickets have been successfully listed on SeatGeek!',
      'ACTION REQUIRED for North Atlas Sound sales',
      "Don't Miss Out! Upload Your Tickets Today",
      'Your tickets were delivered for order# 600700800 - North Atlas Sound',
    ]) {
      expect(looseExtract({ ...ready, subject }), subject).toBeNull();
    }
  });
});

describe('fixtures the parsers already read', () => {
  it('keep their act and date through the second pass', () => {
    const changed: string[] = [];
    for (const [name, raw] of Object.entries(fixtures)) {
      const e = normalizeEmail(raw as Parameters<typeof normalizeEmail>[0]);
      const before = runExtractors(e);
      const after = readTicket(e);
      if (!before) continue;
      const was = before.ticket.artistName ?? before.ticket.eventName;
      const is = after?.ticket.artistName ?? after?.ticket.eventName;
      if (!after || after.ticket.startsAt !== before.ticket.startsAt || was !== is) {
        changed.push(`${name}: ${was} @ ${before.ticket.startsAt} -> ${is} @ ${after?.ticket.startsAt}`);
      }
    }
    expect(changed).toEqual([]);
  });

  it('are never made worse by the second pass', () => {
    for (const [name, raw] of Object.entries(fixtures)) {
      const e = normalizeEmail(raw as Parameters<typeof normalizeEmail>[0]);
      const r = readTicket(e);
      if (!r || r.reviewOnly) continue;
      expect(isBoilerplateTitle(r.ticket.artistName ?? r.ticket.eventName) && !r.ticket.venueName, name).toBe(false);
      expect(r.ticket.startsAt, name).toBeTruthy();
    }
  });
});
