import type { NormalizedEmail } from '@/lib/types';
import type { Kind, Policy } from '@/lib/policies';
import { extractJsonLdBlocks, extractLinks, htmlToText } from '@/lib/ingest/html';
import { readFlightReceipt } from '@/lib/ingest/itinerary';

/**
 * Turn one order or booking email into a purchase.
 *
 * Most merchants embed schema.org markup so Gmail can show order and flight
 * cards: `Order` for stores, `FlightReservation` for airlines,
 * `LodgingReservation` for hotels. That is the reliable path and the only one
 * that sets `confidence: 'high'`. Without it, text patterns find the order
 * number and total, and the result goes to the review queue rather than
 * straight onto the watch list: a wrong price paid means a false alert.
 */

export interface ParsedItem {
  title: string;
  sku?: string;
  url?: string;
  quantity: number;
  unitPriceCents?: number;
}

export interface ParsedSegment {
  carrier?: string;
  flight?: string;
  from?: string;
  to?: string;
  departs?: string;
  /** "United Economy", "United First": the cabin printed beside the flight. */
  cabin?: string;
  /** The fare bucket letter(s) beside it: Q, N, XN. */
  bookingClass?: string;
}

export interface ParsedPurchase {
  kind: Kind;
  merchant: string;
  merchantName: string;
  orderRef?: string;
  purchasedAt: string;
  totalCents?: number;
  currency: string;
  items: ParsedItem[];
  details: Record<string, unknown>;
  confidence: 'high' | 'low';
}

type Node = Record<string, unknown>;

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.trim() || undefined : typeof v === 'number' ? String(v) : undefined;
const typesOf = (n: Node): string[] => asArray(n['@type'] as string | string[]).map((t) => String(t).toLowerCase());

/** "$1,234.56", "1234.5", 1234.56 → 123456. */
export function toCents(v: unknown): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d{1,2})?/);
  if (!m) return undefined;
  const n = Math.round(parseFloat(m[0]) * 100);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Eventbrite-style "2026-06-23 14:00:00" → valid ISO. */
const isoish = (raw?: string) => raw?.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2');

/** Every node in the JSON-LD, flattened one level (a block can be an array). */
function nodes(html: string): Node[] {
  return extractJsonLdBlocks(html)
    .flatMap((b) => asArray(b as Node))
    .filter((n): n is Node => !!n && typeof n === 'object');
}

// ------------------------------------------------------------------ JSON-LD

function fromOrder(n: Node, policy: Policy, email: NormalizedEmail): ParsedPurchase | null {
  const offers = asArray(n.acceptedOffer as Node | Node[]);
  const items: ParsedItem[] = offers.flatMap((o) => {
    const p = (o.itemOffered as Node) ?? {};
    const title = str(p.name);
    if (!title) return [];
    const qty = Number(str((o.eligibleQuantity as Node)?.value) ?? str(o.eligibleQuantity) ?? 1) || 1;
    return [{
      title,
      sku: str(p.sku) ?? str(p.productID) ?? skuFromUrl(str(p.url)),
      url: str(p.url),
      quantity: qty,
      unitPriceCents: toCents(o.price ?? (o.priceSpecification as Node)?.price),
    }];
  });

  const total =
    toCents(n.price) ??
    toCents((n.priceSpecification as Node)?.price) ??
    toCents((n.totalPaymentDue as Node)?.price) ??
    (items.length && items.every((i) => i.unitPriceCents)
      ? items.reduce((s, i) => s + (i.unitPriceCents ?? 0) * i.quantity, 0)
      : undefined);

  return {
    kind: 'retail',
    merchant: policy.id,
    merchantName: str((n.merchant as Node)?.name) ?? str((n.seller as Node)?.name) ?? policy.name,
    orderRef: str(n.orderNumber),
    purchasedAt: isoish(str(n.orderDate)) ?? email.receivedAt,
    totalCents: total,
    currency: str(n.priceCurrency) ?? 'USD',
    items,
    details: {},
    confidence: 'high',
  };
}

function fromFlights(ns: Node[], policy: Policy, email: NormalizedEmail, text: string): ParsedPurchase | null {
  const segs = new Map<string, ParsedSegment>();
  const passengers = new Set<string>();
  let ref: string | undefined;
  let total: number | undefined;
  let currency: string | undefined;

  for (const n of ns) {
    const f = (n.reservationFor as Node) ?? {};
    ref ??= str(n.reservationNumber);
    total ??= toCents(n.totalPrice ?? n.price);
    currency ??= str(n.priceCurrency);
    const who = str((n.underName as Node)?.name);
    if (who) passengers.add(who.toLowerCase());

    const carrier = str((f.airline as Node)?.iataCode);
    // Some airlines repeat their code in the number ("AA 2529"): keep the digits.
    const flight = str(f.flightNumber)?.replace(/^[A-Z0-9]{2}\s+(?=\d)/, '');
    const departs = isoish(str(f.departureTime));
    const key = `${carrier}${flight}${departs}`;
    // One reservation node per passenger per segment: keep each segment once.
    if (!segs.has(key)) {
      segs.set(key, {
        carrier,
        flight,
        from: str((f.departureAirport as Node)?.iataCode),
        to: str((f.arrivalAirport as Node)?.iataCode),
        departs,
      });
    }
  }
  if (segs.size === 0) return null;

  return {
    kind: 'flight',
    merchant: policy.id,
    merchantName: policy.name,
    orderRef: ref,
    purchasedAt: email.receivedAt,
    totalCents: total ?? totalFromText(text),
    currency: currency ?? 'USD',
    items: [],
    details: {
      segments: [...segs.values()].sort((a, b) => (a.departs ?? '').localeCompare(b.departs ?? '')),
      passengers: Math.max(passengers.size, 1),
      fare_brand: fareBrandFromText(text),
    },
    // Without a price paid there's nothing to compare against.
    confidence: total ?? totalFromText(text) ? 'high' : 'low',
  };
}

function fromLodging(n: Node, policy: Policy, email: NormalizedEmail, text: string): ParsedPurchase | null {
  const hotel = (n.reservationFor as Node) ?? {};
  const property = str(hotel.name);
  if (!property) return null;
  const addr = hotel.address as Node | string | undefined;
  const city = typeof addr === 'object' ? str(addr?.addressLocality) : undefined;
  const total = toCents(n.totalPrice ?? n.price);

  return {
    kind: 'hotel',
    merchant: policy.id,
    merchantName: str((n.provider as Node)?.name) ?? property,
    orderRef: str(n.reservationNumber),
    purchasedAt: isoish(str(n.bookingTime)) ?? email.receivedAt,
    totalCents: total ?? totalFromText(text),
    currency: str(n.priceCurrency) ?? 'USD',
    items: [],
    details: {
      property,
      city,
      check_in: isoish(str(n.checkinTime) ?? str(n.checkinDate)),
      check_out: isoish(str(n.checkoutTime) ?? str(n.checkoutDate)),
      refundable: refundableFromText(text),
    },
    confidence: total ? 'high' : 'low',
  };
}

// ------------------------------------------------------------------ text

/** The best "total" on the page: grand/order totals beat a bare "Total". */
export function totalFromText(text: string): number | undefined {
  const lines = text.split('\n');
  const ranked: [number, number][] = [];
  // "$342.20", or an airline's "342.20 USD" with no dollar sign.
  const money = /\$\s?([\d,]+\.\d{2})|\b([\d,]+\.\d{2})\s*USD\b/;
  lines.forEach((line, i) => {
    const label = line.match(/\b(grand total|order total|total charged|amount charged|total paid|trip total|total)\b/i)?.[1]?.toLowerCase();
    if (!label || /subtotal|savings|points|miles|per passenger|per person|per traveler/i.test(line)) return;
    // The amount is on the label's line, or the next one in table-soup email.
    const m = line.match(money) ?? lines[i + 1]?.match(money);
    if (!m) return;
    const rank = label === 'total' ? 1 : 2;
    ranked.push([rank, toCents(m[1] ?? m[2])!]);
  });
  ranked.sort((a, b) => b[0] - a[0]);
  return ranked[0]?.[1];
}

export function orderRefFromText(text: string, kind: Kind): string | undefined {
  const m =
    text.match(/\b(?:order|confirmation|reservation|booking)\s*(?:number|no\.?|#|code)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})\b/i) ??
    (kind === 'flight' ? text.match(/\b(?:record locator|PNR)\s*[:#]?\s*([A-Z0-9]{6})\b/i) : null);
  return m?.[1]?.toUpperCase();
}

export function fareBrandFromText(text: string): string | undefined {
  return text.match(
    /\b(Basic Economy|Main Cabin|Comfort\+|Economy Plus|Premium Select|Premium Economy|Delta One|First Class|Business Class|Choice Extra|Choice Preferred|Wanna Get Away Plus|Wanna Get Away|Main Plus|Saver|Basic)\b/i,
  )?.[1];
}

export function refundableFromText(text: string): boolean | undefined {
  if (/non-?refundable|no refunds?/i.test(text)) return false;
  if (/free cancellation|fully refundable|cancel (?:for free|without (?:charge|penalty))/i.test(text)) return true;
  return undefined;
}

/** Best Buy product links carry the SKU: `...?skuId=6505727`. */
function skuFromUrl(url?: string): string | undefined {
  return url?.match(/[?&]skuId=(\d{6,8})/)?.[1];
}

/**
 * What kind of email this is, from its subject.
 *
 * 'purchase': a booking or order confirmation or receipt — the only kind that
 * may CREATE a purchase. 'update': mail about a trip or order that already
 * exists (pre-trip reminders, check-in, shipping): it may fill gaps on a known
 * purchase but never creates one. Real mail taught this: United sends a dozen
 * "What to know about your trip to…" emails per trip, each carrying the
 * confirmation number, and every one became a bogus purchase.
 */
export type EmailRole = 'purchase' | 'update' | 'schedule' | 'cancelled' | 'other';

export function emailRole(subject: string): EmailRole {
  const s = subject.toLowerCase();
  // The trip no longer exists: nothing left to watch.
  if (/\b(cancellation is complete|(flight|trip|reservation|booking) (has been |was |is )?cancel+ed|received a future flight credit)\b/.test(s)) return 'cancelled';
  // The airline moved the flights: what is on the purchase is now wrong.
  if (/\b(schedule .{0,40}changed|schedule change|itinerary (has )?changed|flight change)\b/.test(s)) return 'schedule';
  // Bought something ON a trip, not the trip: its total is not the fare.
  if (/\b(seat purchase|seat (change|assignment)|upgrade (confirmation|request)|bag(gage)? purchase)\b/.test(s)) return 'update';
  if (/\b(sale|deals?|% off|offer|save up to|sign up|survey|review your|account summary|login|verification|verify|password|terms|update to|newsletter)\b/.test(s)) return 'other';
  if (/\b(what to know|reminder|check[- ]?in|upcoming|get ready|on hold|shipped|on its way|out for delivery|delivered|ready for pickup|plan for your|before you go)\b/.test(s)) return 'update';
  if (/\b(order (confirmation|confirmed|received|#|number)|thanks? (you )?for (your )?(order|purchase|booking)|receipt|booking (confirmation|confirmed|is confirmed)|reservation (confirmation|confirmed)|trip confirmation|e-?ticket|itinerary and receipt|you'?re booked|your order|purchase confirmation|confirmation (#|number))\b/.test(s)) return 'purchase';
  return 'other';
}

/** Kept for the text fallback: any order-ish subject that isn't marketing. */
export function looksLikeOrder(subject: string): boolean {
  return emailRole(subject) !== 'other';
}

// ------------------------------------------------------------------ entry

export function extractPurchase(email: NormalizedEmail, policy: Policy): ParsedPurchase | null {
  const ns = nodes(email.html);
  const text = email.text;

  if (policy.kind === 'retail') {
    const order = ns.find((n) => typesOf(n).includes('order'));
    if (order) {
      const p = fromOrder(order, policy, email);
      if (p) return p;
    }
  }
  if (policy.kind === 'flight') {
    const flights = ns.filter((n) => typesOf(n).includes('flightreservation'));
    if (flights.length) {
      const p = fromFlights(flights, policy, email, text);
      if (p) return p;
    }
  }
  if (policy.kind === 'hotel') {
    const stay = ns.find((n) => typesOf(n).includes('lodgingreservation'));
    if (stay) {
      const p = fromLodging(stay, policy, email, text);
      if (p) return p;
    }
  }

  // ---- text fallback: always low confidence, always reviewed.
  if (!looksLikeOrder(email.subject)) return null;
  // Most mail has no plain-text part worth reading; the HTML, flattened, does.
  // Blank lines dropped: "Total:" and its amount sit on consecutive ROWS of a
  // table, which flatten to lines with a gap between them.
  // ONE copy of the message. The text part is usually the HTML again, and
  // reading both counted every traveller, and so every fare, twice.
  const fromHtml = email.html ? htmlToText(email.html) : '';
  const body = (fromHtml.length >= text.length ? fromHtml : text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  const flight = policy.kind === 'flight' ? readFlightReceipt(body) : null;
  const segments = flight?.segments ?? [];
  const orderRef = orderRefFromText(body, policy.kind) ?? orderRefFromText(email.subject, policy.kind);
  const totalCents = flight?.totalCents ?? totalFromText(body);
  if (!orderRef && !totalCents && segments.length === 0) return null;

  // "Date of purchase" beats the email's own date: a receipt re-sent after a
  // seat change or an upgrade is dated weeks after the ticket was bought.
  const purchasedAt =
    flight?.purchasedOn && flight.purchasedOn !== email.receivedAt.slice(0, 10) ? `${flight.purchasedOn}T20:00:00.000Z` : email.receivedAt;

  const skus = policy.id === 'bestbuy'
    ? [...new Set(extractLinks(email.html).map(skuFromUrl).filter(Boolean))] as string[]
    : [];

  return {
    kind: policy.kind,
    merchant: policy.id,
    merchantName: policy.name,
    orderRef,
    purchasedAt,
    totalCents,
    currency: 'USD',
    items: skus.map((sku) => ({ title: `SKU ${sku}`, sku, quantity: 1 })),
    details:
      policy.kind === 'flight'
        ? {
            segments,
            passengers: flight!.passengers,
            // The cabin beside the flight; the fine-print scan only as a last resort.
            fare_brand: flight!.fareBrand ?? (segments.length ? undefined : fareBrandFromText(body)),
            // Paid in miles: the cash total is taxes, and a fare drop means nothing.
            ...(flight!.award ? { award: true } : {}),
            ...(flight!.miles ? { miles: flight!.miles } : {}),
          }
        : policy.kind === 'hotel'
          ? { refundable: refundableFromText(body) }
          : {},
    confidence: 'low',
  };
}
