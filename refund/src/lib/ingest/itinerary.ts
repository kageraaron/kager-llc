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
const FLIGHT = new RegExp(String.raw`\b(${CARRIERS})\s?(\d{1,4})\b`);

/** Three capitals that are not airports. */
const NOT_AIRPORT = new Set(['USD', 'CAD', 'EUR', 'GBP', 'THE', 'AND', 'FOR', 'NON', 'END', 'TSA', 'PNR', 'USA', 'AM ', 'PM ', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'TAX', 'FEE', 'VIA', 'GMT', 'UTC', 'EST', 'PST', 'CST', 'MST', 'EDT', 'PDT', 'CDT', 'MDT', 'ETA', 'ETD', 'APP', 'FAQ', 'WWW', 'COM', 'INC', 'LLC', 'LTD']);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number | string) => String(n).padStart(2, '0');

function dateOn(line: string): string | undefined {
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
  const m = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m\b/i.exec(line);
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
  };
}

const complete = (s: ParsedSegment) => !!(s.from && s.to && s.departs);

export function looseItinerary(text: string): ParsedSegment[] {
  const lines = text.split('\n').map((l) => l.replace(/[ \t  ]+/g, ' ').trim()).filter(Boolean);

  // One anchor per flight, at its first mention: the fare rules repeat them.
  const anchors: { at: number; carrier: string; flight: string }[] = [];
  lines.forEach((line, at) => {
    const m = FLIGHT.exec(line);
    if (!m || line.length > 120) return;
    if (anchors.some((a) => a.carrier === m[1] && a.flight === m[2])) return;
    anchors.push({ at, carrier: m[1], flight: m[2] });
  });
  if (anchors.length === 0) return [];

  const read = (mode: 'after' | 'before'): ParsedSegment[] =>
    anchors.map((a, i) => {
      const block =
        mode === 'after'
          ? lines.slice(a.at, Math.min(anchors[i + 1]?.at ?? Infinity, a.at + 16))
          : lines.slice(Math.max((anchors[i - 1]?.at ?? -1) + 1, a.at - 20), a.at + 1);
      return { carrier: a.carrier, flight: a.flight, ...readBlock(block) };
    });

  const after = read('after');
  const before = read('before');
  const best = after.filter(complete).length >= before.filter(complete).length ? after : before;

  // A flight with no date is a mention, not a segment.
  return best
    .filter((s) => s.departs)
    .sort((a, b) => (a.departs ?? '').localeCompare(b.departs ?? ''));
}
