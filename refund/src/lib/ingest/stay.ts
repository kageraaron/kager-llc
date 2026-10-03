import { dateOn as dateInWords } from '@/lib/ingest/itinerary';

/** A date on a line, including the European "21.07.2026" (day first: the dots say so). */
function dateOn(line: string): string | undefined {
  const dotted = /\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/.exec(line);
  if (dotted && Number(dotted[2]) <= 12 && Number(dotted[1]) <= 31) {
    return `${dotted[3]}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`;
  }
  return dateInWords(line);
}

/**
 * A hotel stay from a confirmation's text, with no knowledge of the chain.
 *
 * Almost no hotel sends structured markup, and each chain words its
 * confirmation differently. But every one states the same few things, and a
 * price check needs exactly those: which property, which nights, what it
 * costs, and until when it can be cancelled for free. Four real layouts:
 *
 *   Dates / 24 Mar 2027 / - / 29 Mar 2027            (a range, over lines)
 *   Check-In: / Saturday, January 25, 2020            (a label, value below)
 *   Check-in / Thursday, 15-Jan-2026
 *   Date of stay: From 27 Jul 2026 to 28 Jul 2026     (a range, in prose)
 *
 * Everything read this way is low-confidence: a card to confirm, never a
 * price watch on its own.
 */

export interface Stay {
  property?: string;
  city?: string;
  /** The room as the hotel names it: "1 King 1 Qn 2 Bdrm Suite Balcony". */
  room?: string;
  checkIn?: string;
  checkOut?: string;
  totalCents?: number;
  currency?: string;
  /** Can it still be cancelled for free? Undefined when the email does not say. */
  refundable?: boolean;
  /** The last day it can be, when the email gives one. */
  cancelBy?: string;
}

const DAY = 86_400_000;
const clean = (s: string) => s.replace(/&zwnj;|‌/g, '').replace(/&ndash;|&#8211;/g, '–').replace(/&#38;|&amp;/g, '&').replace(/[ \t  ]+/g, ' ').trim();

/** Every date on a line, left to right. */
function datesOn(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  for (let i = 0; i < 3; i++) {
    const d = dateOn(rest);
    if (!d) break;
    out.push(d);
    // Step past the year just read so the next search finds the following date.
    const year = rest.indexOf(d.slice(0, 4));
    if (year === -1) break;
    rest = rest.slice(year + 4);
  }
  return out;
}

/** The hotel's name, which the subject line almost always states outright. */
export function propertyFromSubject(subject: string): string | undefined {
  const s = clean(subject).replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, '');
  const m =
    /reservation at (.+?) (?:is confirmed|has been (?:modified|updated|changed))/i.exec(s) ??
    /reservation confirmation\s*#?\s*\S*\s+for (.+)$/i.exec(s) ??
    /booking confirmation for (.+)$/i.exec(s) ??
    /confirmation of your reservation\s*:\s*(.+?)(?:\s+No\.|\s*$)/i.exec(s) ??
    /(?:upcoming )?stay at (.+?)(?:\s+Res(?:ervation)?\b.*)?$/i.exec(s);
  const name = m?.[1]?.replace(/[.\s]+#.*$/, '').replace(/\s*[-–]\s*\d.*$/, '').trim();
  return name && name.length >= 3 && name.length <= 80 ? name : undefined;
}

function money(line?: string): { cents: number; currency: string } | undefined {
  if (!line) return undefined;
  const after = /([\d.,]+\d)\s*(USD|EUR|GBP|CAD|US DOLLARS)\b/i.exec(line);
  const before = /(USD|EUR|GBP|CAD|\$|€|£)\s?([\d.,]+\d)/i.exec(line);
  const raw = after?.[1] ?? before?.[2];
  const code = (after?.[2] ?? before?.[1] ?? '').toUpperCase();
  if (!raw) return undefined;
  // "250,41" is European for 250.41; "3,195.64" is not.
  const n = /,\d{2}$/.test(raw) && !/\.\d{2}$/.test(raw) ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const currency = code === '$' || code === 'US DOLLARS' ? 'USD' : code === '€' ? 'EUR' : code === '£' ? 'GBP' : code;
  return { cents: Math.round(n * 100), currency };
}

export function readStay(text: string, subject: string, receivedAt: string): Stay {
  const lines = text.split('\n').map(clean).filter(Boolean);
  const out: Stay = { property: propertyFromSubject(subject) };

  // "…confirm your stay at <HOTEL> from…", "Your booking at <HOTEL> in <CITY> is confirmed"
  const said = lines
    .slice(0, 40)
    .map((l) => /\b[Yy]our (?:stay|booking|reservation) at (.{3,70}?)(?: in ([A-Z][A-Za-z .'-]{2,30}?))? (?:from\b|is confirmed|has been)/.exec(l))
    .find(Boolean);
  out.property ??= said?.[1]?.trim();
  out.city = said?.[2]?.trim();

  // ---- nights: labelled rows first, then the first range that reads like a stay.
  const labelled = (label: RegExp) => {
    const i = lines.findIndex((l) => label.test(l));
    if (i === -1) return undefined;
    return dateOn(lines[i].replace(label, '')) ?? dateOn(lines[i + 1] ?? '');
  };
  out.checkIn = labelled(/^check[- ]?in\b(?:\s*date)?:?/i) ?? labelled(/^arrival\b(?:\s*(?:date|time))?:?/i);
  out.checkOut = labelled(/^check[- ]?out\b(?:\s*date)?:?/i) ?? labelled(/^departure\b(?:\s*(?:date|time))?:?/i);

  if (!out.checkIn || !out.checkOut || out.checkOut <= out.checkIn) {
    out.checkIn = out.checkOut = undefined;
    const received = new Date(receivedAt).getTime();
    const found: { at: number; date: string }[] = [];
    lines.slice(0, 90).forEach((l, at) => datesOn(l).forEach((date) => found.push({ at, date })));
    for (let i = 0; i < found.length - 1; i++) {
      const a = found[i];
      const b = found[i + 1];
      const nights = (Date.parse(b.date) - Date.parse(a.date)) / DAY;
      // Two dates close together on the page, 1 to 30 nights apart, not before the email.
      if (b.at - a.at <= 3 && nights >= 1 && nights <= 30 && Date.parse(a.date) >= received - 2 * DAY) {
        out.checkIn = a.date;
        out.checkOut = b.date;
        break;
      }
    }
  }

  // ---- room: the row under "Room details" / "Room Type".
  const roomAt = lines.findIndex((l) => /^room (?:details|type)\s*:?$/i.test(l));
  const room = roomAt === -1 ? undefined : lines[roomAt + 1];
  if (room && room.length >= 3 && room.length <= 90 && !/:$/.test(room)) out.room = room;

  // ---- total: the stay's, not a night's and not the tax line.
  // The first "total" row that actually has an amount with or under it: some
  // layouts print a bare "Total" heading well before the figure.
  const isTotal = (l: string) => /^\*?\s*total(?: charges| for stay.*| price of stay| cost| amount| price)?\s*:?$/i.test(l) || /^\*?\s*total (?:charges|for stay|price of stay)\b/i.test(l);
  const total = lines
    .map((l, i) => (isTotal(l) ? (money(l) ?? money(lines[i + 1]) ?? money(lines[i + 2])) : undefined))
    .find(Boolean);
  if (total) {
    out.totalCents = total.cents;
    out.currency = total.currency;
  }

  // ---- cancellation: free until when?
  // Of the lines about cancelling, the one that gives a deadline, not the
  // first that merely mentions it ("Modify or cancel reservation").
  const about = lines.filter((l) => /cancel|refund|fully covered/i.test(l) && /\b(?:before|by|until|up to|prior)\b/i.test(l));
  const policy = about.find((l) => dateOn(l)) ?? about.find((l) => /prior to arrival|no (?:cancel+ation )?charge|free cancel/i.test(l)) ?? '';
  const all = lines.join('\n');
  if (/\bnon-?refundable\b|advance purchase|prepay in full|no refunds?\b|cannot be cancel+ed/i.test(all)) out.refundable = false;
  if (policy) {
    const by = dateOn(policy);
    const daysPrior = /up to (\d{1,2}) days? prior to arrival/i.exec(policy);
    if (by) out.cancelBy = by;
    else if (daysPrior && out.checkIn) out.cancelBy = new Date(Date.parse(out.checkIn) - Number(daysPrior[1]) * DAY).toISOString().slice(0, 10);
    if (out.cancelBy || /no (?:cancel+ation )?charge|free cancel|without (?:charge|penalty)|fully covered/i.test(policy)) out.refundable = true;
  }
  if (out.refundable === undefined && /free cancel+ation|fully refundable|flexible rate/i.test(all)) out.refundable = true;

  return out;
}
