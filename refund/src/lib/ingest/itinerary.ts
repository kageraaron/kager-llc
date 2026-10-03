import type { ParsedSegment } from '@/lib/ingest/extract';

/**
 * Flight segments from an itinerary's text, with no knowledge of the airline's
 * layout.
 *
 * The structured reader (schema.org markup) is exact, and almost no airline
 * sends it: across 400 days of real mail, 34 United confirmations carried none,
 * and every one became a purchase with no flights on it and so nothing to
 * price-check. But an itinerary always says the same four things about each
 * flight, somewhere near each other: its number, its date, its time, and two
 * airports. Two real layouts, same airline:
 *
 *   Flight 1 of 2 UA552            SFO
 *   Class: United Economy (XN)     1h 36m
 *   Thu, Apr 08, 2027              ONT
 *   Thu, Apr 08, 2027              ...
 *   09:30 PM                       FLIGHT INFO
 *   11:06 PM                       Duration: 1h 36m
 *   San Francisco, CA, US (SFO)    UA 552
 *   Ontario, CA, US (ONT)
 *
 * In the first the details FOLLOW the flight number; in the second they come
 * BEFORE it. So each flight number is an anchor, the lines between it and the
 * next anchor (or the previous one) are its block, and whichever direction
 * gives more complete flights is the one this email uses.
 *
 * Everything read this way is low-confidence: it fills in a purchase for a
 * person to confirm, it does not start a price watch on its own.
 */

/** Carriers a US traveller's itinerary is likely to name. Not a whitelist of merchants. */
const CARRIERS =
  'UA|AA|DL|WN|AS|B6|HA|NK|F9|G4|SY|AC|WS|AM|BA|VS|LH|LX|OS|SN|AF|KL|IB|TP|AY|SK|EI|TK|EK|QR|EY|SQ|CX|NH|JL|KE|OZ|QF|NZ|LA|AV|CM';
const FLIGHT = new RegExp(String.raw`\b(${CARRIERS})\s?(\d{1,4})\b`, 'g');

/**
 * The flight a line is about. A schedule-change notice prints the old flight
 * and then the new one ("UA 1947 UA 1331 operated by…"), so the LAST number on
 * the line is the one that stands.
 */
function flightOn(line: string): { carrier: string; flight: string } | null {
  const all = [...line.matchAll(FLIGHT)];
  const m = all[all.length - 1];
  return m ? { carrier: m[1], flight: m[2] } : null;
}

/** Three capitals that are not airports. */
const NOT_AIRPORT = new Set(['USD', 'CAD', 'EUR', 'GBP', 'THE', 'AND', 'FOR', 'NON', 'END', 'TSA', 'PNR', 'USA', 'AM ', 'PM ', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'TAX', 'FEE', 'VIA', 'GMT', 'UTC', 'EST', 'PST', 'CST', 'MST', 'EDT', 'PDT', 'CDT', 'MDT', 'ETA', 'ETD', 'APP', 'FAQ', 'WWW', 'COM', 'INC', 'LLC', 'LTD']);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number | string) => String(n).padStart(2, '0');

export function dateOn(line: string): string | undefined {
  // "15-Jan-2026", as some hotel chains print it.
  const dashed = /\b(\d{1,2})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*-(\d{4})\b/i.exec(line);
  if (dashed) return `${dashed[3]}-${pad(MONTHS.indexOf(dashed[2].toLowerCase().slice(0, 3)) + 1)}-${pad(dashed[1])}`;
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(line);
  if (named) return `${named[3]}-${pad(MONTHS.indexOf(named[1].toLowerCase().slice(0, 3)) + 1)}-${pad(named[2])}`;
  const dayFirst = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i.exec(line);
  if (dayFirst) return `${dayFirst[3]}-${pad(MONTHS.indexOf(dayFirst[2].toLowerCase().slice(0, 3)) + 1)}-${pad(dayFirst[1])}`;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(line);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(line);
  if (us && Number(us[1]) <= 12 && Number(us[2]) <= 31) return `${us[3]}-${pad(us[1])}-${pad(us[2])}`;
  return undefined;
}

function timeOn(line: string): string | undefined {
  // Old time then new time on one line ("5:45 pm 4:34 pm"): the last one stands.
  const all = [...line.matchAll(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\b/gi)];
  const m = all[all.length - 1];
  if (m) return `${pad((Number(m[1]) % 12) + (/p/i.test(m[3]) ? 12 : 0))}:${m[2]}`;
  // A 24-hour time alone on its line; a duration ("1h 36m") is not one.
  const day = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.exec(line.trim());
  return day ? pad(day[0].split(':')[0]) + ':' + day[0].split(':')[1] : undefined;
}

function airportsOn(line: string): string[] {
  const out = [...line.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]);
  if (/^[A-Z]{3}$/.test(line.trim())) out.push(line.trim());
  // "SFO - ONT", "SFO to ONT", "SFO → ONT"
  const pair = /\b([A-Z]{3})\s*(?:-|–|→|>|to)\s*([A-Z]{3})\b/.exec(line);
  if (pair) out.push(pair[1], pair[2]);
  return out.filter((a) => !NOT_AIRPORT.has(a));
}

/** Cabin names as airlines print them, longest first. */
const CABIN =
  '(?:United |American |Delta )?(?:Polaris business|Basic Economy|Economy Plus|Premium Plus|Premium Economy|Premium Select|Main Cabin|Comfort\\+|Delta One|Economy|Business|First)';

/** "Class: United Economy (XN)", "United First", or "Class: / Economy / (N)" over three lines. */
function cabinIn(block: string[]): { cabin?: string; bookingClass?: string } {
  const joined = block.join('\n');
  const coded = new RegExp(String.raw`(?:Class:\s*)?\b(${CABIN})\s*\(([A-Z]{1,2})\)`, 'i').exec(joined);
  if (coded) return { cabin: coded[1].trim(), bookingClass: coded[2] };
  const plain = block.map((l) => new RegExp(String.raw`^(?:Class:\s*)?(${CABIN})$`, 'i').exec(l)).find(Boolean);
  return plain ? { cabin: plain[1].trim() } : {};
}

function readBlock(block: string[]): Omit<ParsedSegment, 'carrier' | 'flight'> {
  let date: string | undefined;
  let time: string | undefined;
  const airports: string[] = [];
  for (const line of block) {
    date ??= dateOn(line);
    // The departure time is the first one at or after the date.
    if (date) time ??= timeOn(line);
    for (const a of airportsOn(line)) if (!airports.includes(a)) airports.push(a);
  }
  return {
    from: airports[0],
    to: airports[1],
    departs: date ? `${date}T${time ?? '00:00'}:00` : undefined,
    ...cabinIn(block),
  };
}

const complete = (s: ParsedSegment) => !!(s.from && s.to && s.departs);

export function looseItinerary(text: string): ParsedSegment[] {
  const lines = text.split('\n').map((l) => l.replace(/[ \t  ]+/g, ' ').trim()).filter(Boolean);

  // One anchor per flight, at its first mention: the fare rules repeat them.
  const anchors: { at: number; carrier: string; flight: string }[] = [];
  lines.forEach((line, at) => {
    if (line.length > 120) return;
    const f = flightOn(line);
    if (!f) return;
    if (anchors.some((a) => a.carrier === f.carrier && a.flight === f.flight)) return;
    anchors.push({ at, ...f });
  });
  if (anchors.length === 0) return [];

  /*
   * Three places a layout can put a flight's details relative to its number:
   * all after it, all before it, or the date just above and the rest below
   * (a schedule-change notice). Whichever reads the most complete flights is
   * the one this email uses.
   */
  const read = (mode: 'after' | 'before' | 'around'): ParsedSegment[] =>
    anchors.map((a, i) => {
      const next = anchors[i + 1]?.at ?? Infinity;
      const prev = anchors[i - 1]?.at ?? -1;
      const block =
        mode === 'after'
          ? lines.slice(a.at, Math.min(next, a.at + 16))
          : mode === 'before'
            ? lines.slice(Math.max(prev + 1, a.at - 20), a.at + 1)
            : lines.slice(Math.max(prev + 1, a.at - 3), Math.min(next - 3, a.at + 14));
      const seg = { carrier: a.carrier, flight: a.flight, ...readBlock(block) };
      // The cabin can sit just under the flight number even when everything
      // else is above it ("UA 552 / Boeing 737 / United Economy").
      return seg.cabin ? seg : { ...seg, ...cabinIn(lines.slice(a.at, Math.min(next, a.at + 4))) };
    });

  const best = (['after', 'before', 'around'] as const)
    .map(read)
    .sort((x, y) => y.filter(complete).length - x.filter(complete).length)[0];

  // A flight with no date is a mention, not a segment.
  return best
    .filter((s) => s.departs)
    .sort((a, b) => (a.departs ?? '').localeCompare(b.departs ?? ''));
}

// ------------------------------------------------------------------ receipt

/** A booking class that means Basic Economy, per airline. A cabin line that says "Basic" wins over this. */
const BASIC_CLASS: Record<string, string> = { UA: 'N', AA: 'B', DL: 'E' };

export interface FlightReceipt {
  segments: ParsedSegment[];
  passengers: number;
  /** The fare for everyone on the booking, before any credit was applied. */
  totalCents?: number;
  /** Paid in miles, or an exchange with no new airfare: no cash fare to undercut. */
  award: boolean;
  /** Miles spent on the whole booking, when it was paid that way. */
  miles?: number;
  fareBrand?: string;
  /** "Date of purchase", when the email states one (YYYY-MM-DD). */
  purchasedOn?: string;
  /**
   * A fully refundable fare. It costs more than the same seat sold
   * non-refundable, so today's price has to be the refundable one too.
   */
  refundable?: boolean;
}

const cash = (line?: string): number | undefined => {
  const m = /\$\s?([\d,]+\.\d{2})|\b([\d,]+\.\d{2})\s*USD\b/.exec(line ?? '');
  return m ? Math.round(Number((m[1] ?? m[2]).replace(/,/g, '')) * 100) : undefined;
};

/**
 * Everything a fare check needs from a flight confirmation's text.
 *
 * Each rule here corrects a mistake found by checking twelve real bookings
 * against their emails:
 *
 *  - PASSENGERS were always 1. Each traveller has exactly one "Seats:" row.
 *  - The TOTAL was the per-passenger figure, or the total of a later seat or
 *    upgrade purchase printed further down. The fare is "Total Per Passenger"
 *    times the travellers when that is given (it is the price before a flight
 *    credit is applied, which is the figure a fare drop is measured against),
 *    else the FIRST "Total".
 *  - The FARE TYPE was "Basic Economy" on every booking, picked up from the
 *    fine print every airline email carries. It is now the cabin printed next
 *    to the flight itself.
 */
export function readFlightReceipt(text: string): FlightReceipt {
  const lines = text.split('\n').map((l) => l.replace(/[ \t\u00a0\u202f]+/g, ' ').trim()).filter(Boolean);
  const segments = looseItinerary(text);

  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
  const passengers = Math.max(count(/^Seats:/i), count(/^eTicket number\b/i), new Set(lines.filter((l) => /^Traveler \d+$/i.test(l))).size, 1);

  const after = (label: RegExp) => {
    const i = lines.findIndex((l) => label.test(l));
    return i === -1 ? undefined : lines[i + 1];
  };
  const perPassengerLine = after(/^Total Per Passenger:?$/i);
  const totalLine = after(/^Total(?: cost)?:?$/i);
  const perPassenger = cash(perPassengerLine);
  const totalCents = perPassenger !== undefined ? perPassenger * passengers : cash(totalLine);

  const airfare = after(/^Airfare:?$/i);
  const first = segments[0];
  const award =
    /\bmiles\b/i.test(`${perPassengerLine ?? ''} ${totalLine ?? ''}`) ||
    /^0\.00$/.test(airfare ?? '') ||
    // Award booking classes carry a trailing N on the cabin letter: XN, YN, IN.
    segments.some((s) => /^[A-Z]N$/.test(s.bookingClass ?? ''));

  // "15,000 miles + 5.60 USD": the Total is for everyone; a per-passenger line is not.
  const milesOn = (line?: string) => {
    const m = /([\d,]{3,})\s+miles\b/i.exec(line ?? '');
    return m ? Number(m[1].replace(/,/g, '')) : undefined;
  };
  const perPassengerMiles = milesOn(perPassengerLine);
  const miles = milesOn(totalLine) ?? (perPassengerMiles !== undefined ? perPassengerMiles * passengers : undefined);

  let fareBrand = first?.cabin;
  if (first && !/basic/i.test(fareBrand ?? '') && first.bookingClass && BASIC_CLASS[first.carrier ?? ''] === first.bookingClass) {
    fareBrand = 'Basic Economy';
  }

  /*
   * Refundable or not. A receipt states it outright under "Fare Rules"
   * ("REFUNDABLE", or a NONREF code). A booking confirmation only names the
   * fare; "Break from business" is a corporate fare this household books as
   * fully refundable, and it was being compared with the cheapest
   * non-refundable Economy, which reported a drop on a trip that had gone up.
   */
  const rulesAt = lines.findIndex((l) => /^Fare Rules:?$/i.test(l));
  const rules = rulesAt === -1 ? [] : lines.slice(rulesAt + 1, rulesAt + 5);
  let refundable: boolean | undefined;
  if (rules.some((l) => /^REFUNDABLE\b/.test(l))) refundable = true;
  else if (rules.some((l) => /\bNON-?REF/i.test(l))) refundable = false;
  else if (lines.some((l) => /^break from business fare$/i.test(l))) refundable = true;

  const bought = after(/^Date of purchase:?$/i);
  return { segments, passengers, totalCents, award, miles, fareBrand, refundable, purchasedOn: bought ? dateOn(bought) : undefined };
}
