import type { Extractor, NormalizedEmail, ParsedTicket } from '@/lib/types';
import { extractJsonLdBlocks } from '@/lib/ingest/html';

/**
 * The highest-leverage extractor, and the reason this pipeline isn't mostly regex.
 *
 * Ticketmaster, Eventbrite, AXS and several others embed schema.org JSON-LD in
 * their confirmation emails — `EventReservation` (Google's email-markup schema)
 * or a bare `MusicEvent`/`Event`. When present it gives us artist, venue, city
 * and an exact start time with an offset, which is far more reliable than
 * scraping the rendered table. Run this before any vendor-specific extractor.
 */

/**
 * Repair a nearly-ISO timestamp.
 *
 * Eventbrite emits `"2024-06-23 14:00:00"` — a SPACE where ISO 8601 requires a
 * `T`. V8 happens to parse that, so it survives locally, but it is not valid
 * ISO: strict parsers return NaN, and it is inconsistent with every other
 * extractor's output.
 */
export function normalizeIsoish(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2');
}

interface JsonLdNode {
  '@type'?: string | string[];
  name?: string;
  url?: string;
  startDate?: string;
  reservationFor?: JsonLdNode;
  reservationNumber?: string;
  underName?: unknown;
  location?: JsonLdNode;
  address?: JsonLdNode | string;
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string | { name?: string };
  performer?: JsonLdNode | JsonLdNode[];
  reservedTicket?: { ticketNumber?: string; ticketedSeat?: Record<string, string> } | { ticketNumber?: string; ticketedSeat?: Record<string, string> }[];
  totalPrice?: string | number;
  totalTicketQuantity?: string | number;
  numTickets?: string | number;
  priceCurrency?: string;
  bookingTime?: string;
}

function typesOf(node: JsonLdNode): string[] {
  const t = node['@type'];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map((x) => String(x).toLowerCase());
}

function firstPerformerName(performer?: JsonLdNode | JsonLdNode[]): string | undefined {
  if (!performer) return undefined;
  const p = Array.isArray(performer) ? performer[0] : performer;
  return typeof p?.name === 'string' ? p.name : undefined;
}

function addressOf(location?: JsonLdNode): { city?: string; region?: string; country?: string } {
  if (!location) return {};
  const addr = location.address;
  if (!addr || typeof addr === 'string') return {};
  const country =
    typeof addr.addressCountry === 'string' ? addr.addressCountry : addr.addressCountry?.name;
  return { city: addr.addressLocality, region: addr.addressRegion, country };
}

function money(total?: string | number): number | undefined {
  if (total === undefined || total === null) return undefined;
  const n = typeof total === 'number' ? total : Number(String(total).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

function quantity(raw?: string | number): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9]/g, ''));
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : undefined;
}

/** Walk a node into a ParsedTicket, given the event node and optional reservation wrapper. */
function fromEventNode(event: JsonLdNode, reservation?: JsonLdNode): ParsedTicket | null {
  if (!event.name && !event.startDate) return null;

  const { city, region, country } = addressOf(event.location);
  const reservedTicket = Array.isArray(reservation?.reservedTicket)
    ? reservation?.reservedTicket[0]
    : reservation?.reservedTicket;
  const seat = reservedTicket?.ticketedSeat;
  const seatInfo = seat
    ? [seat.seatSection, seat.seatRow, seat.seatNumber].filter(Boolean).join(' · ') || undefined
    : undefined;

  return {
    eventName: event.name,
    artistName: firstPerformerName(event.performer),
    venueName: event.location?.name,
    city,
    region,
    country,
    startsAt: normalizeIsoish(event.startDate),
    sourceUrl: event.url ?? reservation?.url,
    ticketRef: reservation?.reservationNumber ?? reservedTicket?.ticketNumber,
    seatInfo,
    priceCents: money(reservation?.totalPrice),
    ticketQuantity:
      quantity(reservation?.totalTicketQuantity) ??
      quantity(reservation?.numTickets) ??
      (Array.isArray(reservation?.reservedTicket) ? reservation.reservedTicket.length : undefined),
    currency: reservation?.priceCurrency,
    purchasedAt: reservation?.bookingTime,
  };
}

export const jsonLdExtractor: Extractor = {
  name: 'jsonld',

  // No sender restriction on purpose — valid Event markup is trustworthy
  // regardless of who sent it, and this is what gives us coverage of ticket
  // vendors we've never written a specific extractor for.
  match(email: NormalizedEmail): boolean {
    return /application\/ld\+json/i.test(email.html);
  },

  parse(email: NormalizedEmail): ParsedTicket | null {
    const nodes = extractJsonLdBlocks(email.html) as JsonLdNode[];

    // Prefer a reservation: it carries the ticket number and price too.
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (typesOf(node).includes('eventreservation') && node.reservationFor) {
        const parsed = fromEventNode(node.reservationFor, node);
        if (parsed) return parsed;
      }
    }

    // Otherwise any Event-ish node will do.
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (typesOf(node).some((t) => t === 'event' || t.endsWith('event'))) {
        const parsed = fromEventNode(node);
        if (parsed) return parsed;
      }
    }

    return null;
  },
};
