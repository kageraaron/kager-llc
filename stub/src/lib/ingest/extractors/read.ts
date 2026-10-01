import type { NormalizedEmail, ParsedTicket } from '@/lib/types';
import { runExtractors } from '@/lib/ingest/extractors';
import { looseExtract, type LooseTicket } from '@/lib/ingest/extractors/loose';

/**
 * Reading an email, with a second opinion.
 *
 * The layout parsers go first: when one of them knows the email it is the
 * better reader. But a comparison over 1,630 real messages showed two things.
 *
 *  1. The parsers are sometimes wrong in ways a reader that ignores layout is
 *     not. Real cases: a subject line taken for the act ("Ben, View and Save
 *     Your Tickets", "Your Tickets are No Longer for Sale", "Your tickets:
 *     RIVA STARR"); the order date taken for the show ("Confirmed - you're
 *     going to GRiZ!", dated the day it was bought); a venue with its city
 *     still attached ("The Castro Theatre — San Francisco, California").
 *
 *  2. The parsers skip real tickets in layouts they have not seen: a resale
 *     site's "Your tickets are ready", a seller with no parser at all.
 *
 * So the loose reader runs as a SECOND PASS over everything:
 *
 *  - when a parser read the email, the loose read repairs a title that is
 *    plainly a sentence, repairs a date that is plainly the order's, tidies
 *    the venue, and adds its other readings of the title for the matcher;
 *  - when no parser did, the loose read stands in, but only as a card to
 *    review. It is right about which mail holds a ticket less often than the
 *    parsers, so it never adds a show to the list on its own.
 */

export interface Reading {
  extractor: string;
  ticket: ParsedTicket & { alternates?: string[] };
  /** True when nothing vouches for this read but the loose reader. */
  reviewOnly: boolean;
}

/**
 * A "title" that is the email talking, not the name of an act.
 *
 * Phrases, not pronouns: "We Are Scientists", "You Me At Six" and "Thank You
 * Scientist" are bands, so a title is only thrown out for wording no act uses.
 */
const NOT_A_TITLE =
  /\b(?:your (?:e-?)?tickets?|your order|view and save|no longer for sale|went through|ticket transfer|you'?re going to|tickets? (?:are|is|were|have been)|order confirm(?:ed|ation)|log in to|access them)\b|^(?:confirmed\s*[-–:]|success!|action required\b|instructions for\b|event update\b|reminder\s*:|\d{1,2}(?::\d{2})?\s*[ap]\.?m\b)/i;

export function isBoilerplateTitle(title?: string): boolean {
  return !title || NOT_A_TITLE.test(title.trim());
}

/** "The Castro Theatre — San Francisco, California" -> the venue, and where it is. */
function tidyVenue(t: ParsedTicket): Partial<ParsedTicket> {
  const raw = t.venueName?.replace(/&mdash;|&#8212;/gi, '—').replace(/&ndash;|&#8211;/gi, '–').replace(/&amp;/gi, '&').replace(/&#x27;|&#0*39;|&apos;/gi, "'");
  if (!raw) return {};
  const [venue, where] = raw.split(/\s+[—–]\s+/);
  if (!where) return raw === t.venueName ? {} : { venueName: raw };
  const [city, region] = where.split(/\s*,\s*/);
  return { venueName: venue.trim(), city: t.city ?? city?.trim(), region: t.region ?? region?.trim() };
}

const dayOf = (iso?: string) => (iso ? Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) : NaN);

export function secondOpinion(ticket: ParsedTicket, loose: LooseTicket | null, email: NormalizedEmail): { ticket: Reading['ticket']; changed: string[] } | null {
  const out: Reading['ticket'] = { ...ticket, ...tidyVenue(ticket) };
  const changed: string[] = out.venueName !== ticket.venueName ? ['venue'] : [];

  // ---- title
  const name = ticket.artistName ?? ticket.eventName;
  if (isBoilerplateTitle(name)) {
    const better = [loose?.artistName, ...(loose?.alternates ?? [])].find((t) => !isBoilerplateTitle(t));
    if (!better) {
      // Neither reader found an act. A venue and a date can still be matched;
      // a sentence for a name and nothing else is not a ticket.
      if (!out.venueName) return null;
      delete out.artistName;
      delete out.eventName;
    } else {
      out.artistName = better;
      if (isBoilerplateTitle(out.eventName)) delete out.eventName;
    }
    changed.push('title');
  }

  // ---- date: only the one mistake that is unmistakable
  const received = dayOf(email.receivedAt);
  const read = dayOf(ticket.startsAt);
  const second = dayOf(loose?.startsAt);
  const boughtThatDay = Math.abs(read - received) <= 86_400_000;
  if (loose?.startsAt && boughtThatDay && second - received > 2 * 86_400_000) {
    out.startsAt = loose.startsAt;
    changed.push('date');
  }

  // ---- the loose reader's other readings of the title, for the matcher
  const mine = (out.artistName ?? out.eventName ?? '').toLowerCase();
  const extra = [loose?.artistName, ...(loose?.alternates ?? [])]
    .filter((t): t is string => !!t && !isBoilerplateTitle(t) && t.toLowerCase() !== mine);
  if (extra.length) out.alternates = [...new Set(extra)].slice(0, 3);

  return { ticket: out, changed };
}

export function readTicket(email: NormalizedEmail): Reading | null {
  const first = runExtractors(email);
  const loose = looseExtract(email);

  if (first) {
    // Structured markup is the seller's own statement of the event: leave it be.
    if (first.extractor === 'jsonld') return { ...first, reviewOnly: false };
    const second = secondOpinion(first.ticket, loose, email);
    if (!second) return null;
    return {
      extractor: second.changed.length ? `${first.extractor}+loose` : first.extractor,
      ticket: second.ticket,
      reviewOnly: false,
    };
  }

  if (!loose || process.env.STUB_LOOSE_FALLBACK === 'off') return null;
  if (isBoilerplateTitle(loose.artistName)) {
    const better = loose.alternates.find((t) => !isBoilerplateTitle(t));
    if (!better && !loose.venueName) return null;
    loose.artistName = better;
  }
  return { extractor: 'loose', ticket: loose, reviewOnly: true };
}
