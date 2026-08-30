import type { Extractor, NormalizedEmail, ParsedTicket } from '@/lib/types';
import { htmlToText, senderDomain } from '@/lib/ingest/html';
import { TICKET_SENDER_DOMAINS } from '@/lib/ingest/extractors/vendors';
import {
  findDate,
  findOrderNumber,
  findPrice,
  findTicketQuantity,
  findVenue,
  cleanArtistName,
} from '@/lib/ingest/extractors/heuristics';

/**
 * Last resort: read a ticket email from a vendor we have never seen.
 *
 * Ticketing is a long tail. Writing a spec per vendor does not scale, and the
 * failure mode when one is missing is the worst available — TicketWeb had a
 * spec with no name extraction and every one of its confirmations was silently
 * dropped, with no error and no review card. A generic reader turns "lost" into
 * "queued for review", which is a decision the user can actually make.
 *
 * ## Why this is safe to run on any sender
 *
 * It is not a licence to guess. Three things keep it conservative:
 *
 *  1. **The subject must look transactional.** A marketing blast about a show
 *     on sale is not a ticket, and the difference is almost always in the
 *     subject line.
 *  2. **A date AND a name are both required**, as everywhere else in the
 *     pipeline, and the date has to be in the future relative to the email.
 *     A newsletter listing ten upcoming gigs has no single date to find.
 *  3. **It never auto-adds.** `confidence` still comes from the matcher, and
 *     anything this produces without corroboration lands in the review queue.
 *
 * The asymmetry is deliberate: a wrong review card costs one tap, a dropped
 * confirmation costs a show the user never learns was missed.
 */

/**
 * Phrases that mean "you bought something", as opposed to "you might like to".
 *
 * Deliberately transactional rather than topical — "tickets" alone appears in
 * every marketing email a venue has ever sent.
 */
const TRANSACTIONAL_SUBJECT =
  /\b(?:order (?:confirmation|confirmed|#)|your (?:order|tickets?|e-?tickets?)|tickets? (?:are|is) (?:here|ready|confirmed)|thanks? for your (?:order|purchase)|thank you for your (?:order|purchase)|purchase confirm|booking (?:confirm|reference)|you'?re going to|you got tickets|receipt|confirmation (?:number|#))/i;

/**
 * Body proof, required IN ADDITION to the subject.
 *
 * A subject can be coincidental; a body that also names an order number or a
 * total is a receipt. This is what keeps event newsletters out.
 */
const TRANSACTIONAL_BODY =
  /\b(?:order\s*(?:number|no\.?|#|confirmation)|confirmation\s*(?:number|code|#)|booking\s*reference|total\s*(?:paid|charged)?|amount\s+(?:paid|charged)|e-?ticket)\b/i;

/**
 * Proof this is an EVENT, not merely a purchase.
 *
 * A retail order confirmation is indistinguishable from a ticket confirmation
 * on transactional language alone — both have an order number, a total and a
 * date. A real Gap receipt ("Order Confirmation #1P1S0X6", "Total: $84.50",
 * "Ships by Friday, November 14, 2026") sailed through the first version of
 * this extractor and was queued as a concert.
 *
 * A denylist of retailers is unwinnable; requiring positive evidence of a venue
 * or a door is not. Every real ticket email has at least one of these.
 */
const EVENT_EVIDENCE =
  /\b(?:venue|doors?\s*(?:open|at)|general\s+admission|admission|box\s*office|will\s*call|seat|section|row\s+[A-Z0-9]|lineup|set\s*times?|showtime|support(?:ing)?\s+act|all\s+ages|1[89]\+|21\+|standing|balcony|orchestra|mezzanine|festival|matinee|tour)\b/i;

/**
 * Signals this is a parcel, not a gig. Checked even when `EVENT_EVIDENCE`
 * matched, because "tour" and "admission" turn up in retail copy too.
 */
const RETAIL_SIGNAL =
  /\b(?:ship(?:s|ped|ping)?\s+(?:by|to|on)|tracking\s+number|track\s+your\s+(?:package|order|shipment)|delivery\s+address|estimated\s+delivery|return\s+policy|free\s+returns|size\s*:|colou?r\s*:|in\s+your\s+cart|restock)\b/i;

/** Senders that are definitely not ticketing, however transactional they look. */
const NEVER =
  /(?:^|\.)(?:amazon|ebay|paypal|stripe|doordash|ubereats|instacart|gap|gapfactory|oldnavy|bananarepublic|target|walmart|etsy|shopify|apple|google|microsoft|uber|lyft|airbnb)\.(?:com|co\.uk)$/i;

/**
 * Subject shapes that are prose about tickets, not the name of an act. Same
 * reasoning as the vendor extractors' `SENTENCE_SUBJECT`.
 */
const NOT_A_NAME =
  /\b(?:were|was|have been|has been|is|are)\s+(?:delivered|transferred|sent|ready|available|confirmed|updated|received|issued)\b|^\s*(?:your|here are|thanks?|thank you|order|purchase|booking|receipt|confirmation)\b/i;

/** Strip the transactional wrapper to leave, hopefully, the act. */
function nameFromSubject(subject: string): string | undefined {
  const stripped = subject
    .replace(
      /^\s*(?:re:|fwd?:)?\s*(?:thanks? for your|thank you for your|your|here are your|order confirmation(?: for)?|confirmation of|receipt for|you'?re going to|you got tickets to)\s*/i,
      '',
    )
    .replace(
      /\s*(?:order confirmation|confirmation|receipt|purchase|order|tickets?|e-?tickets?)\s*[!.]*\s*$/i,
      '',
    )
    .replace(/\s*[-–—|:]\s*(?:order\s*#?\s*\w+|#\w+)\s*$/i, '')
    .trim();

  if (stripped.length < 2 || NOT_A_NAME.test(stripped)) return undefined;

  const cleaned = cleanArtistName(stripped);
  // A long subject is a sentence we failed to recognise, not a band.
  if (cleaned.length < 2 || cleaned.split(/\s+/).length > 8) return undefined;
  return cleaned;
}

export const genericExtractor: Extractor = {
  name: 'generic',

  match(email: NormalizedEmail) {
    const domain = senderDomain(email.from);
    if (!domain || NEVER.test(domain)) return false;

    // Anything a vendor extractor already owns has had its turn and declined;
    // running a weaker reader over it would only produce a worse answer.
    if (TICKET_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;

    return TRANSACTIONAL_SUBJECT.test(email.subject);
  },

  parse(email: NormalizedEmail): ParsedTicket | null {
    const text = email.text || htmlToText(email.html);
    const both = `${text}\n${email.html ? htmlToText(email.html) : ''}`;

    // The subject got us here; the body has to corroborate on three counts.
    if (!TRANSACTIONAL_BODY.test(both)) return null;
    // ...that it is an event at all...
    if (!EVENT_EVIDENCE.test(both)) return null;
    // ...and that it is not a parcel wearing an event's vocabulary.
    if (RETAIL_SIGNAL.test(both)) return null;

    const price = findPrice(both);
    const ticket: ParsedTicket = {
      // Future-preferring, because an order date sits next to the event date in
      // every receipt and is the wrong one.
      startsAt: findDate(both, { preferFuture: true }),
      artistName: nameFromSubject(email.subject),
      ticketRef: findOrderNumber(both),
      priceCents: price.cents,
      currency: price.currency,
      ticketQuantity: findTicketQuantity(both),
      ...findVenue(both),
    };

    // Same bar as every other extractor: a name and a date, or it is not a
    // ticket we can do anything useful with.
    if (!ticket.startsAt) return null;
    if (!ticket.artistName && !ticket.eventName && !ticket.venueName) return null;

    return ticket;
  },
};
