import type { Extractor, NormalizedEmail, ParsedTicket } from '@/lib/types';
import { htmlToText, senderDomain, extractLinks } from '@/lib/ingest/html';
import {
  findDate,
  findOrderNumber,
  findPrice,
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
  /** Vendor-specific pass, run before the shared heuristics fill the gaps. */
  specific?: (email: NormalizedEmail, text: string) => Partial<ParsedTicket>;
}

/** Ticketmaster/Live Nation put the event id in every deep link. */
function ticketmasterEventId(html: string): string | undefined {
  for (const href of extractLinks(html)) {
    const m = /ticketmaster\.[a-z.]+\/event\/([A-Z0-9]{8,})/i.exec(href);
    if (m) return m[1];
  }
  return undefined;
}

/** The subject is usually the cleanest artist signal we get. */
function artistFromSubject(subject: string, strip: RegExp): string | undefined {
  const cleaned = cleanArtistName(subject.replace(strip, '').trim());
  return cleaned.length >= 2 ? cleaned : undefined;
}

const SPECS: VendorSpec[] = [
  {
    name: 'ticketmaster',
    domains: ['ticketmaster.com', 'email.ticketmaster.com', 'livenation.com', 'email.livenation.com'],
    subject: /(?:your (?:tickets?|order)|order confirmation|you're going)/i,
    specific: (email, text) => ({
      tmEventId: ticketmasterEventId(email.html),
      artistName: artistFromSubject(
        email.subject,
        /^(?:your tickets? (?:for|to)|order confirmation(?: for)?|you're going to)\s*/i,
      ),
      ...findVenue(text),
    }),
  },
  {
    name: 'axs',
    domains: ['axs.com', 'email.axs.com', 'e.axs.com'],
    subject: /(?:order confirmation|your tickets?|purchase confirmation)/i,
    specific: (email) => ({
      artistName: artistFromSubject(
        email.subject,
        /^(?:order confirmation(?: for)?|your tickets? (?:for|to)|purchase confirmation(?: for)?)\s*/i,
      ),
    }),
  },
  {
    name: 'dice',
    domains: ['dice.fm', 'email.dice.fm', 'mail.dice.fm'],
    subject: /(?:you're going|your ticket|booking confirmed)/i,
    specific: (email, text) => {
      // DICE lays out labelled rows: "Event", "Venue", "Date".
      const event = /\bEvent\s*\n\s*([^\n]{2,80})/i.exec(text)?.[1];
      const venue = /\bVenue\s*\n\s*([^\n]{2,80})/i.exec(text)?.[1];
      return {
        artistName: event ? cleanArtistName(event) : artistFromSubject(email.subject, /^you're going to\s*/i),
        venueName: venue?.trim(),
      };
    },
  },
  {
    name: 'eventbrite',
    domains: ['eventbrite.com', 'order.eventbrite.com', 'noreply.eventbrite.com'],
    subject: /(?:your tickets?|order confirmation|you're going)/i,
    specific: (email, text) => ({
      eventName: artistFromSubject(email.subject, /^(?:your tickets? (?:for|to)|order confirmation(?: for)?)\s*/i),
      ...findVenue(text),
    }),
  },
  {
    name: 'seetickets',
    domains: ['seetickets.us', 'seetickets.com', 'wl.seetickets.us'],
    subject: /(?:order confirmation|your tickets?|e-?ticket)/i,
  },
  {
    name: 'ticketweb',
    domains: ['ticketweb.com', 'email.ticketweb.com'],
    subject: /(?:order confirmation|your tickets?)/i,
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

function buildExtractor(spec: VendorSpec): Extractor {
  return {
    name: spec.name,

    match(email) {
      const domain = senderDomain(email.from);
      const domainHit = spec.domains.some((d) => domain === d || domain.endsWith(`.${d}`));
      return domainHit && spec.subject.test(email.subject);
    },

    parse(email) {
      const text = email.text || htmlToText(email.html);
      const vendor = spec.specific?.(email, text) ?? {};
      const price = findPrice(text);

      const ticket: ParsedTicket = {
        // Event dates are in the future at purchase time; that disambiguates
        // the event date from the order date sitting right next to it.
        startsAt: findDate(text, { preferFuture: true }),
        ticketRef: findOrderNumber(text),
        priceCents: price.cents,
        currency: price.currency,
        ...vendor,
      };

      // Require at least a name and a date, else this is not a ticket email.
      if (!ticket.startsAt) return null;
      if (!ticket.artistName && !ticket.eventName && !ticket.venueName) return null;
      return ticket;
    },
  };
}

export const vendorExtractors: Extractor[] = SPECS.map(buildExtractor);

/** Sender domains worth pulling from Gmail at all — used to build the search query. */
export const TICKET_SENDER_DOMAINS = [
  ...new Set(SPECS.flatMap((s) => s.domains.map((d) => d.split('.').slice(-2).join('.')))),
];
