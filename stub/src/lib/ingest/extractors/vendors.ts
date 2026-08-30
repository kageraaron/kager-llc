import type { Extractor, NormalizedEmail, ParsedTicket } from '@/lib/types';
import { htmlToText, senderDomain, extractLinks } from '@/lib/ingest/html';
import { eventIdFromText as ebEventIdFromText } from '@/lib/providers/eventbrite';
import {
  findDate,
  findOrderNumber,
  findPrice,
  findTicketQuantity,
  findVenue,
  cleanArtistName,
} from '@/lib/ingest/extractors/heuristics';

/**
 * Per-vendor extractors for emails without usable JSON-LD.
 *
 * Each declares the sender domains it owns and a subject pattern, then leans on
 * the shared heuristics plus whatever vendor-specific anchor is reliable (a
 * Ticketmaster event id in a link, DICE's "Event" label, and so on).
 */

interface VendorSpec {
  name: string;
  domains: string[];
  subject: RegExp;
  /**
   * Accept on the sender domain alone, ignoring the subject.
   *
   * For a purely transactional sender this is right: DICE titles its
   * confirmations with the EVENT NAME and nothing else
   * ("SLOTHACID TOUR: SACHA ROBOTTI + TRUTH X LIES"), so no subject pattern can
   * ever match it. `parse` still requires a name and a date, so marketing mail
   * from the same domain is rejected there rather than here.
   */
  trustDomain?: boolean;
  /** Vendor-specific pass, run before the shared heuristics fill the gaps. */
  specific?: (email: NormalizedEmail, text: string) => Partial<ParsedTicket>;
}

/**
 * Eventbrite puts the event id in every deep link, the same way Ticketmaster
 * does. It is worth strictly more here, though: the id can be handed straight
 * back to Eventbrite's own API for an authoritative answer, including the IANA
 * timezone the email's JSON-LD leaves out.
 */
function eventbriteEventId(email: NormalizedEmail, text: string): string | undefined {
  for (const href of extractLinks(email.html)) {
    const id = ebEventIdFromText(href);
    if (id) return id;
  }
  // Plain-text alternatives carry bare URLs with no href to extract.
  return ebEventIdFromText(email.html) ?? ebEventIdFromText(text);
}

/** Ticketmaster/Live Nation put the event id in every deep link. */
function ticketmasterEventId(html: string): string | undefined {
  for (const href of extractLinks(html)) {
    const m = /ticketmaster\.[a-z.]+\/event\/([A-Z0-9]{8,})/i.exec(href);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Subject lines that are pure boilerplate, with no artist in them at all.
 *
 * A real See Tickets email is subjected simply "Here Are Your Tickets". The
 * strip pattern expects "... for <artist>", finds no "for", removes nothing,
 * and hands back the whole subject — so the ticket was recorded with
 * `artistName: "Here Are Your Tickets"`, which then creates a junk artist row
 * and poisons matching. Returning nothing is strictly better: the body block
 * usually knows, and failing that the message belongs in the review queue.
 */
const BOILERPLATE_SUBJECT =
  /^(?:here are |)?(?:your |you received |)(?:e-?)?tickets?!?$|^(?:order|purchase|ticket|booking)\s+confirm(?:ation|ed)$|^your order$|^purchase confirmation$/i;

/**
 * Subjects that are a whole SENTENCE about tickets rather than a name.
 *
 * `BOILERPLATE_SUBJECT` is anchored at both ends, so it only rejects a subject
 * that is *exactly* boilerplate. A real AXS delivery notice — "Your tickets were
 * delivered to your account!" — has boilerplate at the front and then keeps
 * going, so it sailed through and was stored as
 * `artistName: "Your tickets were delivered to your account!"`.
 *
 * That is worse than storing nothing three times over: the matcher searches
 * every provider for an artist by that name (burning metered quota to find
 * nothing), the candidate can never match, and "Add it anyway" would create a
 * junk artist row that then poisons name matching for everything after it.
 *
 * A name is a noun phrase. These are the verb-led constructions that say the
 * subject is prose, and no act is called any of them.
 */
const SENTENCE_SUBJECT =
  /\b(?:were|was|have been|has been|is|are)\s+(?:delivered|transferred|sent|ready|available|confirmed|updated|received|issued)\b|\bthank you\b|\bdon'?t forget\b|\bcoming up\b|\breminder\b|\bstarts? (?:soon|today|tomorrow)\b/i;

/** The subject is usually the cleanest artist signal we get — when it has one. */
function artistFromSubject(subject: string, strip: RegExp): string | undefined {
  const stripped = subject.replace(strip, '').trim();
  if (BOILERPLATE_SUBJECT.test(stripped) || SENTENCE_SUBJECT.test(stripped)) return undefined;

  const cleaned = cleanArtistName(stripped);
  if (cleaned.length < 2) return undefined;

  /*
   * A last guard on length. Even after the patterns above, a subject running to
   * a dozen words is a sentence we failed to recognise rather than a band with
   * a very long name — and the cost of being wrong is asymmetric: nothing is
   * lost by falling through to the body, while a junk name is persisted.
   */
  if (cleaned.split(/\s+/).length > 10) return undefined;

  return BOILERPLATE_SUBJECT.test(cleaned) || SENTENCE_SUBJECT.test(cleaned) ? undefined : cleaned;
}

/** Non-empty, whitespace-trimmed lines. Both text and HTML views pad heavily. */
function lines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * AXS purchase confirmations carry one authoritative line:
 *
 *   Order details for Chris Stussy - Presale at Shed A scheduled on 2/27/2026 6:00 PM
 *
 * Artist, venue and start time in one place. That matters more than
 * convenience: the surrounding text also contains the ORDER date ("Jan 27
 * 2026") earlier in the document, and the generic `findDate` scan prefers the
 * earliest-appearing date whenever no future one is present — so on a
 * past-dated email it would confidently return the purchase date as the event
 * date. Anchoring here avoids the question.
 *
 * Note the time arrives as "6:00\u202fPM" — a NARROW NO-BREAK SPACE, not a
 * plain one. JS `\s` covers U+202F, so `parseTime` handles it, but only if the
 * body was decoded as UTF-8 rather than latin1.
 */
const AXS_ORDER_LINE =
  /Order details for\s+(.{2,120}?)\s+at\s+(.{2,80}?)\s+scheduled on\s+(\d{1,2}\/\d{1,2}\/\d{4}[^\n]{0,20})/i;

/**
 * AXS transfer notices ("Ben transferred 3 tickets to you") are a different
 * shape entirely — no order number, no price, and the event laid out as three
 * consecutive lines:
 *
 *   Sat May 2, 2026 - 8:00 PM
 *   Chris Lake - Admissions
 *   Shed A, San Francisco, CA
 *
 * A transferred ticket is still a show you are going to, so this is worth
 * reading rather than skipping.
 */
const AXS_TRANSFER = /transferred\s+\d+\s+tickets?\s+to\s+you\s+for\s+the\s+following\s+event/i;

function parseAxsTransfer(text: string): Partial<ParsedTicket> | null {
  const all = lines(text);
  const at = all.findIndex((l) => AXS_TRANSFER.test(l));
  if (at === -1) return null;

  const dateLine = all[at + 1];
  const eventLine = all[at + 2];
  const venueLine = all[at + 3];
  if (!dateLine || !eventLine) return null;

  const out: Partial<ParsedTicket> = {
    artistName: cleanArtistName(eventLine),
    startsAt: findDate(dateLine),
    ticketQuantity: Number(/\btransferred\s+(\d+)\s+tickets?\s+to\s+you/i.exec(all[at])?.[1] ?? '') || undefined,
  };

  // "Shed A, San Francisco, CA"
  if (venueLine) {
    const parts = venueLine.split(/\s*,\s*/).filter(Boolean);
    const region = parts.length > 1 && /^[A-Z]{2}$/.test(parts[parts.length - 1]) ? parts.pop() : undefined;
    const city = parts.length > 1 ? parts.pop() : undefined;
    const venueName = parts.join(', ') || undefined;
    Object.assign(out, { venueName, city, region });
  }

  return out;
}

/**
 * See Tickets / Eventim lay the event out as a labelled block:
 *
 *   Shiba San
 *   Friday, May 8, 2026
 *   1015 Folsom
 *   1015 Folsom St, San Francisco, CA
 *   Show 10:00PM
 *
 * The full weekday-prefixed date line is the anchor; venue and address follow
 * it. The artist comes from the subject or the "guest list for X" phrasing,
 * both of which are cleaner than the block's first line.
 */
const LONG_DATE_LINE = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+[a-z]+\s+\d{1,2},?\s+\d{4}$/i;

/** "Goldenvoice Presents", "DJ Dials & 1015 Folsom Present:" — the block's top. */
const PRESENTER_LINE = /\bpresents?\s*:?\s*$/i;

function parseSeeTicketsBlock(text: string): Partial<ParsedTicket> {
  const all = lines(text);
  const at = all.findIndex((l) => LONG_DATE_LINE.test(l));
  if (at === -1) return {};

  const out: Partial<ParsedTicket> = {};

  /*
   * The bill sits directly ABOVE the date, headliner first:
   *
   *   Goldenvoice Presents
   *   Mipso            <- headliner
   *   Julia Pratt      <- support
   *   Saturday, February 17, 2024
   *
   * Walk up from the date until a presenter line or prose, then take the
   * topmost name. This is the only reliable artist source here — the subject
   * is often just "Here Are Your Tickets".
   */
  const bill: string[] = [];
  for (let i = at - 1; i >= 0 && at - i <= 4; i--) {
    const line = all[i];
    if (PRESENTER_LINE.test(line)) break;
    // Prose, not a name.
    if (line.length > 60 || /[.!?]$/.test(line) || /,/.test(line)) break;
    bill.unshift(line);
  }
  if (bill.length) out.artistName = cleanArtistName(bill[0]);

  /*
   * The time sits a couple of lines below the date, as either "Show 10:00PM"
   * or "Doors 8:00PM | Show 9:00PM".
   *
   * Prefer the SHOW time. Both appear on one line with doors first, so reading
   * the line as-is takes doors and files the gig an hour early.
   */
  const timeLine = all.slice(at, at + 5).find((l) => /^(?:show|doors?)\b/i.test(l));
  const showTime = timeLine?.match(/\bshow\s*([0-9][^|]*)/i)?.[1]?.trim() ?? timeLine;
  out.startsAt = findDate(showTime ? `${all[at]} ${showTime}` : all[at]);

  const venueName = all[at + 1];
  if (venueName && !/^(?:show|doors?)\b/i.test(venueName)) out.venueName = venueName;

  const address = all[at + 2];
  if (address?.includes(',')) {
    const parts = address.split(/\s*,\s*/).filter(Boolean);
    if (parts.length > 1 && /^[A-Z]{2}$/.test(parts[parts.length - 1])) out.region = parts.pop();
    if (parts.length > 1) out.city = parts.pop();
  }

  return out;
}

/**
 * DICE titles are "TOUR NAME: HEADLINER + SUPPORT". The full string is the
 * event name, but the matcher scores on an ARTIST, so pull the first act out:
 * strip a leading "... TOUR:" segment, then take everything before the first
 * "+" separator.
 */
function diceHeadliner(title: string): string | undefined {
  const afterTour = /tour\s*:\s*(.+)$/i.exec(title)?.[1] ?? title;
  const first = afterTour.split(/\s+(?:\+|x|&|and)\s+/i)[0];
  const cleaned = cleanArtistName(first);
  return cleaned.length >= 2 ? cleaned : undefined;
}

/**
 * Proof that a DICE email is a CONFIRMATION rather than marketing.
 *
 * `trustDomain` lets any dice.fm mail reach `parse`, which is necessary because
 * DICE subjects its confirmations with the bare event title. The cost is that
 * promotional mail from the same domain arrives here too — and a promo for a
 * dated show ("Tickets on sale — Fri 12 Dec") has both a name and a date, so it
 * would otherwise parse as a ticket the user never bought.
 *
 * So the subject alone is never enough: the body has to say it is an order.
 */
const DICE_CONFIRMATION =
  /you're going to|purchase confirmation|ticket details|your tickets are stored/i;

const SPECS: VendorSpec[] = [
  {
    name: 'ticketmaster',
    domains: ['ticketmaster.com', 'email.ticketmaster.com', 'livenation.com', 'email.livenation.com'],
    // "You Got Tickets To X" is Ticketmaster's most common phrasing and was
    // missing, so real confirmations were skipped entirely.
    subject: /(?:your (?:tickets?|order)|order confirmation|you're going|you got tickets)/i,
    specific: (email, text) => {
      const title = artistFromSubject(
        email.subject,
        /^(?:your tickets? (?:for|to)|order confirmation(?: for)?|you're going to|you got tickets to)\s*/i,
      );

      const out: Partial<ParsedTicket> = {
        tmEventId: ticketmasterEventId(email.html),
        ...findVenue(text),
      };

      /*
       * The confirmation carries a clean three-line event block:
       *
       *     GARETH EMERY - LSR/CITY: CYBERPUNK
       *     Fri · Mar 21, 2025 · 8:00 PM
       *     Bill Graham Civic Auditorium — San Francisco, California
       *
       * Anchored on the middle line, whose interpunct format is distinctive
       * enough not to appear anywhere else. `findVenue` cannot help here: it
       * needs a "Venue:"-style label, and Ticketmaster does not use one.
       */
      const TM_DATE_LINE = /^\w{3}\s*·\s*\w{3}\s+\d{1,2},\s*\d{4}\s*·/;
      for (const haystack of [text, htmlToText(email.html)]) {
        const all = lines(haystack);
        const at = all.findIndex((l) => TM_DATE_LINE.test(l));
        if (at === -1) continue;

        out.startsAt ??= findDate(all[at]);

        const venueLine = all[at + 1];
        if (venueLine && !out.venueName) {
          // "Bill Graham Civic Auditorium — San Francisco, California"
          const [venue, where] = venueLine.split(/\s*[—–]\s*/);
          if (venue) out.venueName = venue.trim();
          const city = where?.split(/\s*,\s*/)[0];
          if (city) out.city = city.trim();
        }
        if (out.venueName) break;
      }

      /*
       * Ticketmaster titles an event "<ARTIST> - <PRODUCTION>", and the
       * production half is not searchable anywhere — "GARETH EMERY -
       * LSR/CITY: CYBERPUNK" matches no artist on any provider.
       *
       * So the full string is kept as the event name, for display, and the
       * leading segment becomes the artist, for matching. Splitting is safe
       * even when both halves are acts ("Nine Inch Nails - Trent Reznor"),
       * because the leading half is still the right thing to search for.
       */
      if (title) {
        out.eventName = title;
        const lead = title.split(/\s+[-–—]\s+/)[0]?.trim();
        out.artistName = lead && lead.length >= 2 ? cleanArtistName(lead) : title;
      }

      return out;
    },
  },
  {
    name: 'axs',
    domains: ['axs.com', 'email.axs.com', 'e.axs.com'],
    // AXS's actual purchase subject is "Thank you for your order for X - Presale",
    // and its transfer subject is "You Received Tickets". Neither matched the
    // original pattern, so every real AXS email was skipped before parsing.
    subject:
      /(?:order confirmation|your tickets?|purchase confirmation|thank you for your order|you received tickets|tickets? transferred)/i,
    specific: (email, text) => {
      /*
       * Look in the HTML as well as the plain-text part, and in that order of
       * preference. AXS sends BOTH, and the multipart/alternative text part is
       * a degraded copy: its order-details table renders as
       * "Order details for **  *Quantity* *Type* ..." with the artist, venue
       * and event date stripped out. Only the HTML carries the real line.
       *
       * The pipeline hands `specific` the text part whenever one exists, so
       * relying on it alone silently produced the ORDER date as the event date.
       */
      const htmlText = htmlToText(email.html);
      for (const haystack of [htmlText, text]) {
        const order = AXS_ORDER_LINE.exec(haystack);
        if (order) {
          return {
            artistName: cleanArtistName(order[1]),
            venueName: order[2].trim(),
            startsAt: findDate(order[3]),
            ticketQuantity: findTicketQuantity(haystack),
          };
        }
      }

      for (const haystack of [text, htmlText]) {
        const transfer = parseAxsTransfer(haystack);
        if (transfer) return transfer;
      }

      return {
        artistName: artistFromSubject(
          email.subject,
          /^(?:order confirmation(?: for)?|your tickets? (?:for|to)|purchase confirmation(?: for)?|thank you for your order for)\s*/i,
        ),
      };
    },
  },
  {
    name: 'dice',
    domains: ['dice.fm', 'email.dice.fm', 'mail.dice.fm'],
    subject: /(?:you're going|your ticket|booking confirmed|purchase confirmation)/i,
    // DICE subjects the email with the EVENT NAME alone, so no pattern matches.
    trustDomain: true,
    specific: (email, text) => {
      // The HTML view keeps the label/value rows on separate lines; the text
      // alternative runs them together. Check both.
      const htmlText = htmlToText(email.html);
      const out: Partial<ParsedTicket> = {};

      // Marketing mail from dice.fm reaches this point too (see `trustDomain`).
      // Without a confirmation marker in the SUBJECT or the body, return
      // nothing and let the "needs a name" guard in buildExtractor reject it.
      const confirmed =
        DICE_CONFIRMATION.test(email.subject) ||
        DICE_CONFIRMATION.test(htmlText) ||
        DICE_CONFIRMATION.test(text);
      if (!confirmed) return {};

      for (const haystack of [htmlText, text]) {
        // "You're going to <title>" is the one reliable name anchor. The
        // "Event" label the old code looked for is not present in a real DICE
        // confirmation.
        /*
         * Two layouts, both real:
         *  - current: "You're going to <title>" in the body, venue/date under
         *    "Ticket details" with a "Date & time" label;
         *  - older:   labelled rows "Event" / "Venue" / "Date".
         * Fall back to the subject, which on a current confirmation IS the title.
         */
        const title =
          /^[ \t]*Event[ \t]*$\n[ \t]*([^\n]{2,120})/im.exec(haystack)?.[1]?.trim() ||
          /you're going to\s+([^\n]{2,120})/i.exec(haystack)?.[1]?.trim() ||
          artistFromSubject(email.subject, /^you're going to\s*/i) ||
          undefined;

        const venue = /^[ \t]*Venue[ \t]*$\n[ \t]*([^\n]{2,80})/im.exec(haystack)?.[1]?.trim();
        // "Date & time" then "Sat 01 Oct,10:00 PM GMT-7" — NO YEAR anywhere in
        // the message, so the received date resolves it.
        const when =
          /^[ \t]*Date[ \t]*(?:&|and)[ \t]*time[ \t]*$\n[ \t]*([^\n]{4,60})/im.exec(haystack)?.[1]?.trim() ??
          /^[ \t]*Date[ \t]*$\n[ \t]*([^\n]{4,60})/im.exec(haystack)?.[1]?.trim();
        // "Price" then "$70.26". Not a "total"-shaped label, so findPrice misses it.
        const price =
          /^[ \t]*Price[ \t]*$\n[ \t]*([$£€])[ \t]?([\d,]+\.\d{2})/im.exec(haystack) ??
          /\bTotal\s*:?\s*([$£€])\s?([\d,]+\.\d{2})/i.exec(haystack);

        // Reject a "title" with no letters or digits: an HTML entity such
        // as &#8202; is not a name.
        if (title && /[a-z0-9]/i.test(title) && !out.eventName) {
          out.eventName = cleanArtistName(title);
          out.artistName = diceHeadliner(title);
        }
        if (venue && !out.venueName) out.venueName = venue;
        if (when && !out.startsAt) {
          out.startsAt = findDate(when, { yearlessReference: email.receivedAt });
        }
        if (price && out.priceCents === undefined) {
          out.priceCents = Math.round(Number(price[2].replace(/,/g, '')) * 100);
          out.currency = { $: 'USD', '£': 'GBP', '€': 'EUR' }[price[1]];
        }
      }

      // The address line under the venue: "314 11th St, San Francisco, CA 94103, USA".
      const addr = /^[ \t]*Venue[ \t]*$\n[ \t]*[^\n]{2,80}\n[ \t]*([^\n]{6,120})/im.exec(htmlText)?.[1];
      const geo = /,\s*([A-Za-z .'-]{2,40}),\s*([A-Z]{2})\b/.exec(addr ?? '');
      if (geo) {
        out.city = geo[1].trim();
        out.region = geo[2];
      }

      return out;
    },
  },
  {
    name: 'eventbrite',
    domains: ['eventbrite.com', 'order.eventbrite.com', 'noreply.eventbrite.com'],
    subject: /(?:your tickets?|order confirmation|you're going)/i,
    specific: (email, text) => ({
      ebEventId: eventbriteEventId(email, text),
      eventName: artistFromSubject(email.subject, /^(?:your tickets? (?:for|to)|order confirmation(?: for)?)\s*/i),
      ...findVenue(text),
    }),
  },
  {
    name: 'seetickets',
    domains: ['seetickets.us', 'seetickets.com', 'wl.seetickets.us', 'eventim.com'],
    subject: /(?:order confirmation|your tickets?|e-?ticket|here are your tickets|guest list)/i,
    // Previously had no `specific` at all, so it never produced a name and the
    // "needs at least one of artist/event/venue" guard rejected every message.
    specific: (email, text) => {
      const guestList = /added to the guest list for\s+([^\n.]{2,80})/i.exec(text)?.[1];
      return {
        artistName:
          (guestList && cleanArtistName(guestList)) ||
          artistFromSubject(
            email.subject,
            /^(?:here are your tickets for|your tickets? (?:for|to)|order confirmation(?: for)?)\s*/i,
          ),
        ...parseSeeTicketsBlock(text),
      };
    },
  },
  {
    // Frontgate handles a lot of US festivals (Outside Lands, Austin City
    // Limits). It was missing entirely, so those receipts matched no extractor.
    name: 'frontgate',
    domains: ['frontgatetickets.com', 'order-support.frontgatetickets.com'],
    subject: /(?:receipt|your tickets?|order confirmation|order #)/i,
    specific: (email, text) => {
      // "Your Outside Lands Receipt - Order #173544320" -> "Outside Lands".
      const eventName = artistFromSubject(
        email.subject,
        /^your\s+/i,
      )?.replace(/\s*receipt\b.*$/i, '').trim();

      // "Friday, August 7, 2026 - Sunday, August 9, 2026" then "at Golden Gate Park".
      const venue = /^\s*at\s+(.{2,80})$/im.exec(text)?.[1]?.trim();
      const all = lines(text);
      const dateAt = all.findIndex((l) => /^[a-z]+day,\s+[a-z]+\s+\d{1,2},\s+\d{4}/i.test(l));

      const out: Partial<ParsedTicket> = {
        eventName: eventName && eventName.length >= 2 ? eventName : undefined,
        venueName: venue,
      };

      // A festival spans days; the first date is the one to file it under.
      if (dateAt !== -1) out.startsAt = findDate(all[dateAt].split(/\s*[-–—]\s*/)[0]);

      // The address sits under the "at <venue>" line.
      const cityLine = all.find((l) => /^[A-Za-z .'-]{2,40},\s*[A-Z]{2}$/.test(l));
      if (cityLine) {
        const [city, region] = cityLine.split(/\s*,\s*/);
        out.city = city;
        out.region = region;
      }

      return out;
    },
  },
  {
    /*
     * TicketWeb had a spec with no `specific`, so it matched the sender, found
     * no name, and was rejected by the "needs a name" guard in `buildExtractor`
     * — every TicketWeb confirmation was silently dropped.
     *
     * Its body carries a labelled block, which is the reliable anchor:
     *
     *     *Event Details:*
     *     Ben Böhmer
     *     The Independent
     *     628 Divisadero St, San Francisco, CA
     *     Sun Aug 9, 2026 at 10:00 PM
     */
    name: 'ticketweb',
    domains: ['ticketweb.com', 'email.ticketweb.com', 't.ticketweb.com'],
    subject: /(?:order confirmation|your tickets?|you're going)/i,
    specific: (email, text) => {
      const out: Partial<ParsedTicket> = {};

      for (const haystack of [text, htmlToText(email.html)]) {
        const all = lines(haystack);
        const at = all.findIndex((l) => /^\*?Event Details:?\*?$/i.test(l));
        if (at === -1) continue;

        /*
         * A WINDOW, not fixed offsets. The real block interleaves a Google Maps
         * link between the address and the date, so `slice(at+1, at+5)` landed
         * on the URL and the generic date scan then picked up the forwarding
         * header's own timestamp instead of the show.
         */
        const block = all.slice(at + 1, at + 9).filter((l) => !/^<?https?:\/\//.test(l));
        const [artist, venue] = block;
        if (artist) out.artistName ??= cleanArtistName(artist);
        if (venue) out.venueName ??= venue;

        for (const line of block) {
          // "628 Divisadero St, San Francisco, CA"
          const geo = /,\s*([A-Za-z .'-]{2,40}),\s*([A-Z]{2})\b/.exec(line);
          if (geo && !out.city) {
            out.city = geo[1].trim();
            out.region = geo[2];
          }
          if (!out.startsAt) out.startsAt = findDate(line);
        }
        if (out.artistName) break;
      }

      // Fall back to the subject: "You're going to Ben Böhmer!"
      out.artistName ??= artistFromSubject(
        email.subject,
        /^(?:your tickets? are here!?\s*)?(?:you're going to)\s*/i,
      )?.replace(/!+$/, '');

      return out;
    },
  },
  {
    /*
     * SeatGeek is a resale marketplace, so its confirmation says the order is
     * placed and the tickets are not in hand yet ("This email is not your
     * ticket"). That is still a show the buyer is going to, and the event block
     * is unambiguous:
     *
     *     Fred Again (21+)
     *     Sat, Jan 31, 2026 at 7:00PM
     *     East End Studios - Woodside, Woodside, NY
     *
     * The block repeats verbatim further down; taking the first is correct.
     */
    name: 'seatgeek',
    domains: ['seatgeek.com', 'links.seatgeek.com', 'email.seatgeek.com'],
    subject: /(?:purchase|order|your tickets?|thanks for your)/i,
    specific: (email, text) => {
      const out: Partial<ParsedTicket> = {};

      // "Thanks for your Fred Again (21+) purchase!" — the cleanest name here.
      out.artistName = artistFromSubject(
        email.subject,
        /^thanks for your\s*/i,
      )?.replace(/\s*purchase!?\s*$/i, '');

      /*
       * Two templates, and both put the SALE date in the same shape as the
       * event date:
       *
       *   purchase mail        delivery mail
       *   ------------------   -----------------------------------
       *   Fred Again (21+)     Sale date
       *   Sat, Jan 31 … 7PM    Fri, Dec 19, 2025 at 5:22pm   <- not the show
       *   East End Studios…    Event
       *                        Fred Again (21+)
       *                        East End Studios - Woodside, Woodside, NY
       *                        Sat, Jan 31, 2026 at 7:00PM
       *
       * Taking the first date-shaped line recorded the PURCHASE date as the
       * show and "Event" as the venue. So: prefer the labelled block, and
       * otherwise skip any date sitting under a sale/purchase label.
       */
      const DATE_LINE = /^[A-Z][a-z]{2},\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+at\s+\d/;
      const SALE_LABEL = /^\*?(?:sale|purchase|order)\s+date\*?:?$/i;

      for (const haystack of [text, htmlToText(email.html)]) {
        const all = lines(haystack);

        const labelled = all.findIndex((l) => /^\*?Event\*?:?$/i.test(l));
        const block =
          labelled !== -1
            ? all.slice(labelled + 1, labelled + 5)
            : all.filter((l, i) => !(DATE_LINE.test(l) && SALE_LABEL.test(all[i - 1] ?? '')));

        /*
         * The labelled block leads with the act, which is the only name in a
         * delivery notice — its subject is "Your tickets are ready! Action
         * required" and says nothing about who is playing.
         */
        if (labelled !== -1 && block[0] && !DATE_LINE.test(block[0])) {
          out.artistName ??= cleanArtistName(block[0]);
        }

        for (const [i, line] of block.entries()) {
          if (!out.startsAt && DATE_LINE.test(line) && !SALE_LABEL.test(block[i - 1] ?? '')) {
            out.startsAt = findDate(line);
          }
          // "East End Studios - Woodside, Woodside, NY"
          if (!out.venueName && /,\s*[A-Z]{2}$/.test(line)) {
            const parts = line.split(/\s*,\s*/).filter(Boolean);
            const region = parts.pop();
            const city = parts.length > 1 ? parts.pop() : undefined;
            out.venueName = parts.join(', ') || undefined;
            out.city = city;
            out.region = region;
          }
        }
        if (out.startsAt && out.venueName) break;
      }

      return out;
    },
  },
  {
    /*
     * Tixr sells festivals, and its confirmation names the event in the subject
     * and repeats it above the venue:
     *
     *     Order Confirmation
     *     Lightning in a Bottle 2027
     *     Lightning In A Bottle, Buena Vista Lake
     *     Wed May 26 - Sun May 30
     *
     * Note the date carries NO YEAR while the title does. Resolving it against
     * the received date picks the wrong one — this arrived in June 2026, so the
     * nearest "May 26" is 2026, but the festival is 2027. The title is the
     * authority, so the year is taken from there when it has one.
     */
    name: 'tixr',
    domains: ['tixr.com', 'mail.tixr.com'],
    subject: /(?:order confirmation|your tickets?|purchase)/i,
    specific: (email, text) => {
      const out: Partial<ParsedTicket> = {};

      const name = artistFromSubject(email.subject, /^order confirmation:?\s*/i);
      if (name) out.eventName = name;

      const haystack = text || htmlToText(email.html);
      const all = lines(haystack);

      // "Lightning In A Bottle, Buena Vista Lake" — venue, then location.
      const at = all.findIndex((l) => name && l.trim() === name.trim());
      const venueLine = at !== -1 ? all[at + 1] : undefined;
      if (venueLine?.includes(',')) {
        const parts = venueLine.split(/\s*,\s*/).filter(Boolean);
        out.venueName = parts[parts.length - 1] ?? undefined;
      }

      /*
       * A festival title ending in a year is the most reliable date signal in
       * the message, and the only one that disambiguates a year-less range.
       */
      const titleYear = /\b(20\d{2})\b/.exec(name ?? '')?.[1];
      const range = all.find((l) => /^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s*[-–—]/.test(l));
      if (range) {
        const firstDay = range.split(/\s*[-–—]\s*/)[0];
        out.startsAt = titleYear
          ? findDate(`${firstDay} ${titleYear}`)
          : findDate(firstDay, { yearlessReference: email.receivedAt });
      }

      return out;
    },
  },
  {
    name: 'etix',
    domains: ['etix.com'],
    subject: /(?:order confirmation|your tickets?)/i,
  },
  {
    name: 'bandsintown',
    domains: ['bandsintown.com', 'mail.bandsintown.com'],
    subject: /(?:you're going|rsvp|ticket)/i,
  },
];

/** Drop keys whose value is `undefined`, so a spread cannot erase a known field. */
function definedOnly(vendor: Partial<ParsedTicket>): Partial<ParsedTicket> {
  return Object.fromEntries(
    Object.entries(vendor).filter(([, v]) => v !== undefined),
  ) as Partial<ParsedTicket>;
}

function buildExtractor(spec: VendorSpec): Extractor {
  return {
    name: spec.name,

    match(email) {
      const domain = senderDomain(email.from);
      const domainHit = spec.domains.some((d) => domain === d || domain.endsWith(`.${d}`));
      if (!domainHit) return false;
      return spec.trustDomain || spec.subject.test(email.subject);
    },

    parse(email) {
      const text = email.text || htmlToText(email.html);
      const vendor = spec.specific?.(email, text) ?? {};
      const price = findPrice(text);

      /*
       * Quantity often lives ONLY in the HTML. A multipart AXS confirmation
       * sends a plain-text part whose order table has been flattened to
       * "Order details for ** *Quantity* *Type* ..." with every value stripped
       * out, while the HTML still has the real row. So fall back to the HTML
       * view rather than concluding the count is unknown.
       */
      const ticketQuantity =
        findTicketQuantity(text) ??
        (email.html ? findTicketQuantity(htmlToText(email.html)) : undefined);

      const ticket: ParsedTicket = {
        // Event dates are in the future at purchase time; that disambiguates
        // the event date from the order date sitting right next to it.
        startsAt: findDate(text, { preferFuture: true }),
        ticketRef: findOrderNumber(text),
        priceCents: price.cents,
        ticketQuantity,
        currency: price.currency,
        // A vendor pass that looked for a field and did not find it returns
        // `undefined` for it. Spreading that would DELETE the value the shared
        // heuristics just found, so only real values are allowed to win.
        ...definedOnly(vendor),
      };

      // Require at least a name and a date, else this is not a ticket email.
      if (!ticket.startsAt) return null;
      if (!ticket.artistName && !ticket.eventName && !ticket.venueName) return null;
      return ticket;
    },
  };
}

export const vendorExtractors: Extractor[] = SPECS.map(buildExtractor);

/**
 * Ticketing platforms with no extractor of their own.
 *
 * Listed purely so the Gmail query FETCHES their mail — an email that is never
 * pulled can never be parsed, and the generic extractor plus JSON-LD handle a
 * surprising number of these without a bespoke spec. Adding a domain here is
 * cheap; adding a wrong one only costs a few messages read and skipped.
 *
 * `match()` deliberately does NOT consult this list, so a domain here does not
 * claim an email away from the generic reader.
 */
const EXTRA_FETCH_DOMAINS = [
  'stubhub.com',
  'vividseats.com',
  'gametime.co',
  'universe.com',
  'showclix.com',
  'ticketleap.com',
  'brownpapertickets.com',
  'wl.seetickets.us',
  'residentadvisor.net',
  'ra.co',
  'shotgun.live',
  'fatsoma.com',
  'skiddle.com',
  'eventix.io',
  'humanitix.com',
  'moshtix.com.au',
  'ticketek.com',
  'ents24.com',
  'songkick.com',
  'posh.vip',
  'partiful.com',
  'luma.com',
  'lu.ma',
];

/** Sender domains worth pulling from Gmail at all — used to build the search query. */
export const TICKET_SENDER_DOMAINS = [
  ...new Set([
    ...SPECS.flatMap((s) => s.domains.map((d) => d.split('.').slice(-2).join('.'))),
    ...EXTRA_FETCH_DOMAINS.map((d) => d.split('.').slice(-2).join('.')),
  ]),
];
