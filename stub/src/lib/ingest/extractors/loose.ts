import type { NormalizedEmail, ParsedTicket } from '@/lib/types';
import { htmlToText, senderDomain } from '@/lib/ingest/html';
import {
  cleanArtistName,
  findDate,
  findOrderNumber,
  findPrice,
  findTicketQuantity,
} from '@/lib/ingest/extractors/heuristics';
import {
  NOT_A_TICKET_SUBJECT,
  TICKET_SENDER_DOMAINS,
  billedAct,
  isSportsTitle,
  leadingAct,
  lineupHeadliner,
} from '@/lib/ingest/extractors/vendors';

/**
 * A reader that does not know any vendor's layout.
 *
 * The vendor extractors each describe one seller's email exactly, and every
 * one of them has broken the same way: the seller changed the layout (StubHub
 * between 2025 and 2026), or sends several (AXS has an order email, a resale
 * email and a "tickets delivered" email, all different), and the message was
 * silently ignored until someone noticed a show was missing.
 *
 * What those emails have in common is simpler than any one of them: somewhere
 * there is a line carrying the event's date and time, and the title and the
 * venue are within a few lines of it, on it, or labelled. So:
 *
 *   1. find the line most likely to be the EVENT's date (not the order's);
 *   2. take the lines around it as candidates for title and venue;
 *   3. hand the best guess, and the runners-up, to the catalog matcher.
 *
 * Step 3 is what makes loose reading safe. This file is allowed to be wrong
 * about which neighbour is the act, and it does not try to settle questions it
 * cannot ("Weezer: Voyage To The Blue Planet" has the act before the colon,
 * "Fresh Start Afters: Odd Mob" after it): it offers both. Nothing is added to
 * anyone's list unless a real listing for that act, on that date, agrees.
 */

export interface LooseTicket extends ParsedTicket {
  /** Other readings of the title, best first, for the matcher to try. */
  alternates: string[];
}

function decode(s: string): string {
  return s
    .replace(/&middot;|&bull;|&#183;|&#8226;/gi, '·')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&amp;/gi, '&')
    .replace(/&apos;|&#0*39;|&rsquo;|&#8217;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, ' ');
}

interface Line {
  text: string;
  /** Set in bold or stars in the original: how a layout marks its headline. */
  strong: boolean;
}

function toLines(text: string): Line[] {
  return text
    .split('\n')
    .map((raw) => {
      const t = decode(raw).trim();
      const strong = /^\*{1,2}[^*]+\*{1,2}$/.test(t);
      return { text: t.replace(/[*_`]+/g, ' ').replace(/[ \t  ]+/g, ' ').trim(), strong };
    })
    .filter((l) => l.text);
}

// ---------------------------------------------------------------- eligibility

/** Subjects that read like the seller confirming something to a buyer. */
const CONFIRMATION_SUBJECT =
  /\b(?:order (?:confirm|#|for)|your (?:order|tickets?|e-?tickets?|ticket order)|receipt|tickets? (?:are|is|were|have been) (?:here|ready|confirmed|delivered)|thanks? for your|thank you for (?:your|purchasing)|purchase confirm|you'?re going|you got tickets|you received tickets|booking confirm|here are your tickets)/i;

/** A body that names an order: what a seller's marketing mail never has. */
const CONFIRMATION_BODY =
  /\b(?:order\s*(?:number|no\.?|#|id|confirm)|booking reference|confirmation (?:number|code|#)|purchase confirmation|you'?re going to|your tickets are)/i;

/** The seller's side of a resale, and transfers out: not a show to attend. */
/*
 * Every line here came from real mail the first loose pass took for a ticket:
 * a resale sale ("You confirmed your ticket transfer for Sale #…", "ACTION
 * REQUIRED for <act> sales"), a listing, a transfer OUT to a friend ("Your
 * ticket transfer for <act> is on its way to <name>"), an upload nag, and
 * account or shipping notices. Being ABOUT a ticket is not holding one.
 */
const NOT_A_PURCHASE_SUBJECT =
  /\b(?:you sold|sales?|buyer|posting|dispute|deliver the tickets|listed|listing|payment processed|payout|ticket transfer (?:to|for)|transfer for .{1,80} is on its way|accept(?:ed)? your ticket transfer|upload your tickets|pre-upload|tell us how we did|feedback|tickets you need to sell|refund|delivery type change|has shipped|about to ship|ship your tickets|review and confirm|upgrade confirmation|password|welcome to)\b|\bdelivered for order\b|^\s*action required\b/i;

/**
 * Does this look like a seller confirming a ticket, going by the envelope
 * alone? The Inbox uses it to pull a real confirmation Stub could not read out
 * of the pile of newsletters it sits in.
 */
export function looksLikeTicketMail(email: { from: string; subject: string }): boolean {
  if (NOT_A_TICKET_SUBJECT.test(email.subject) || NOT_A_PURCHASE_SUBJECT.test(email.subject)) return false;
  if (!CONFIRMATION_SUBJECT.test(email.subject)) return false;
  const domain = senderDomain(email.from);
  return (
    TICKET_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`)) ||
    /^(?:\s*(?:fwd?|fw)\s*:)/i.test(email.subject)
  );
}

/** The same question with the body to hand: this is what gates a loose or model read. */
export function eligible(email: NormalizedEmail, body: string): boolean {
  if (NOT_A_TICKET_SUBJECT.test(email.subject) || NOT_A_PURCHASE_SUBJECT.test(email.subject)) return false;
  const domain = senderDomain(email.from);
  const seller = TICKET_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
  const subject = CONFIRMATION_SUBJECT.test(email.subject);
  // A seller whose subject is just the event's name (DICE) is vouched for by its body.
  if (seller) return subject || CONFIRMATION_BODY.test(body);
  // A hand-forward comes from a person, so the subject has to carry it, and
  // the body has to be about tickets: "Fwd: <shop> Order Confirmation" is not.
  return subject && /^(?:\s*(?:fwd?|fw)\s*:)/i.test(email.subject) && /\b(?:e-?tickets?|admission|venue|doors)\b/i.test(body);
}

// --------------------------------------------------------------------- dates

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*';
const pad = (n: number | string) => String(n).padStart(2, '0');

/** Everything on a line that is date or time, so what is left can be measured. */
const DATEISH = new RegExp(
  String.raw`\b${WEEKDAY}\b|\b${MONTH}\b\.?|\b\d{1,2}(?:st|nd|rd|th)?\b|\b\d{4}\b|\b\d{1,2}[:.]\d{2}\b|\b[ap]\.?m\.?\b|\b[A-Z]{2,4}T\b|\bGMT[+-]?\d*|[,|@·\-–—/.:()]|\bat\b|\bon\b`,
  'gi',
);

/** Words that mark a date as the order's, the delivery's or the footer's. */
const NOT_THE_EVENT =
  /\border\s*(?:#|id\b|no\b)|\b(?:pre-?sale|on-?sale|on sale|sale (?:date|starts?|begins?|ends?)|sold on|listed on|order\s*(?:#|no|number|date|placed|time|total|id)|purchased?|payment|paid|charged|billing|invoice|©|copyright|by\s+(?:mon|tue|wed|thu|fri|sat|sun)|tickets?\s+by|deliver(?:y|ed)\s+by|expires?|valid (?:until|through)|sent on|transaction)\b/i;

function timeOn(s: string): [number, number] | null {
  // Seconds are allowed and ignored: "6:00:00 PM".
  const twelve = /\b(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])\.?m\b/i.exec(s);
  if (twelve) return [(Number(twelve[1]) % 12) + (/p/i.test(twelve[3]) ? 12 : 0), Number(twelve[2] ?? 0)];
  const day = /(?:^|[\s|@,·-])([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?(?:\s|$)/.exec(s);
  return day ? [Number(day[1]), Number(day[2])] : null;
}

/**
 * "Sat Nov 16 at 10:00 PM", "Wed May 26 - Sun May 30": a weekday and a date
 * with no year. The weekday settles the year, which is better than guessing
 * the nearest one: it is right, or it finds nothing.
 */
function yearless(line: string, receivedAt: string): string | undefined {
  const m = new RegExp(
    String.raw`\b(${WEEKDAY})\b[\s,·]*(?:(\d{1,2})\s+(${MONTH})|(${MONTH})\.?\s+(\d{1,2}))\b(?!,?\s*\d{4})(.{0,30})`,
    'i',
  ).exec(line);
  if (!m) return undefined;
  const weekday = WEEKDAYS.indexOf(m[1].toLowerCase().slice(0, 3));
  const month = MONTHS.indexOf((m[3] ?? m[4]).toLowerCase().slice(0, 3));
  const dayOfMonth = Number(m[2] ?? m[5]);
  const ref = new Date(receivedAt);
  if (weekday < 0 || month < 0 || !dayOfMonth || Number.isNaN(ref.getTime())) return undefined;

  const years = [0, 1, 2, -1].map((d) => ref.getUTCFullYear() + d);
  const fits = years.filter((y) => new Date(Date.UTC(y, month, dayOfMonth)).getUTCDay() === weekday);
  const year =
    fits.find((y) => Date.UTC(y, month, dayOfMonth) >= ref.getTime() - 2 * 86_400_000) ?? fits[0];
  if (year === undefined) return undefined;
  const t = timeOn(m[6] ?? '');
  return `${year}-${pad(month + 1)}-${pad(dayOfMonth)}T${pad(t?.[0] ?? 0)}:${pad(t?.[1] ?? 0)}:00`;
}

/** The date on one line, including the shapes the shared `findDate` does not read. */
function dateOnLine(line: string, receivedAt: string): string | undefined {
  let found = /\b\d{4}\b/.test(line) ? findDate(line) : undefined;
  found ??= yearless(line, receivedAt) ?? findDate(line, { yearlessReference: receivedAt });

  // "11-14-25 at 8:00 pm" (US, two-digit year).
  if (!found) {
    const short = /\b(\d{1,2})-(\d{1,2})-(\d{2})\b/.exec(line);
    if (short && Number(short[1]) <= 12 && Number(short[2]) <= 31) {
      found = `20${short[3]}-${pad(short[1])}-${pad(short[2])}T00:00:00`;
    }
  }
  if (!found) return undefined;

  // A 24-hour time ("| 20:00") or one the shared parser missed.
  if (found.endsWith('T00:00:00')) {
    const t = timeOn(line.replace(/\b\d{1,2}-\d{1,2}-\d{2}\b/, ''));
    if (t && (t[0] || t[1])) found = `${found.slice(0, 11)}${pad(t[0])}:${pad(t[1])}:00`;
  }
  return found;
}

interface Anchor {
  at: number;
  startsAt: string;
  score: number;
}

function findAnchor(all: Line[], receivedAt: string, labelled?: number): Anchor | null {
  const received = new Date(receivedAt).getTime();
  let best: Anchor | null = null;

  all.forEach(({ text: own }, at) => {
    if (own.length > 240) return;
    /*
     * A date laid out as table cells arrives as separate lines:
     *     Sat / September 26 - / 1:00 PM
     * A bare weekday above belongs to this line (and settles the year); a bare
     * time below belongs to it too.
     */
    const above = all[at - 1]?.text ?? '';
    const below = all[at + 1]?.text ?? '';
    const cells = new RegExp(String.raw`^${WEEKDAY}$`, 'i').test(above) && /^[A-Za-z]{3,9} \d{1,2}\b/.test(own);
    const line = cells ? `${above} ${own}${/^\d{1,2}:\d{2}\s*[ap]\.?m\.?$/i.test(below) ? ` ${below}` : ''}` : own;
    const startsAt = dateOnLine(line, receivedAt);
    if (!startsAt) return;

    const when = new Date(`${startsAt}Z`).getTime();
    const leftover = line.replace(DATEISH, '').replace(/\s+/g, '');
    const before = all[at - 1]?.text ?? '';
    let score = 0;
    if (!startsAt.endsWith('T00:00:00')) score += 3;
    // An event is, almost always, after the email that sold it.
    if (!Number.isNaN(received) && when >= received - 36 * 3_600_000) score += 2;
    // A line that is nothing but a date is a layout's "when" row.
    if (leftover.length <= 6) score += 2;
    if (cells) score += 2;
    if (new RegExp(String.raw`\b${WEEKDAY}\b`, 'i').test(line)) score += 1;
    if (at === labelled) score += 4;
    // "…at <venue> scheduled on <date>": a seller saying when the show is. It
    // outranks everything, including the word "Presale" in the act's own row.
    const stated = /\b(?:scheduled (?:on|for)|takes place|event date|show date)\b/i.test(line);
    // The order's own timestamp often sits on the line under "Order #…".
    const underOrder = /^order\s*#/i.test(before) && Math.abs(when - received) <= 36 * 3_600_000;
    if (stated) score += 5;
    else if (NOT_THE_EVENT.test(line) || underOrder || /\b(?:order|purchase|sale)\s+(?:date|time)\b|\b(?:pre-?sale|on-?sale)\b/i.test(before)) score -= 6;
    // The header block of a forwarded message: "Date: Wed, Aug 26, 2026 at 10:02 AM".
    if (/^(?:date|sent)\s*:/i.test(line) && /^(?:from|subject|to)\s*:/i.test(`${before}\n${all[at + 1]?.text ?? ''}`.split('\n').find((l) => /^(?:from|subject|to)\s*:/i.test(l)) ?? '')) score -= 8;
    if (line.length > 140) score -= 1;

    if (!best || score > best.score) best = { at, startsAt, score };
  });

  const anchor = best as Anchor | null;
  if (!anchor || anchor.score < 3) return null;

  // "Friday, May 8, 2026" with "Doors 8:00PM | Show 9:00PM" a few lines on.
  if (anchor.startsAt.endsWith('T00:00:00')) {
    for (const l of all.slice(anchor.at + 1, anchor.at + 5)) {
      const show = /\bshow\b\D{0,8}(\d{1,2}(?::\d{2})?\s*[ap]\.?m)/i.exec(l.text) ?? /\bdoors?\b\D{0,12}(\d{1,2}(?::\d{2})?\s*[ap]\.?m)/i.exec(l.text);
      const t = show ? timeOn(show[1]) : null;
      if (t) {
        anchor.startsAt = `${anchor.startsAt.slice(0, 11)}${pad(t[0])}:${pad(t[1])}:00`;
        break;
      }
    }
  }
  return anchor;
}

// -------------------------------------------------------------------- labels

const TITLE_LABEL = /^(?:event|artist|show|performer|headliner|event name)\s*:?$/i;
const VENUE_LABEL = /^(?:venue|location|where|place)\s*:?$/i;
const DATE_LABEL = /^(?:date|date\s*(?:&|and)\s*time|when|event date)\s*:?$/i;

/** Rows a layout labels outright: "Venue" on one line and its value on the next, or "Venue: X". */
function labelled(all: Line[]): { title?: string; venue?: string; dateAt?: number } {
  const out: { title?: string; venue?: string; dateAt?: number } = {};
  all.forEach(({ text }, i) => {
    const next = all[i + 1]?.text;
    const inline = /^([A-Za-z &]{3,18}):\s+(\S.*)$/.exec(text);
    const [label, value, valueAt] = inline ? [inline[1], inline[2], i] : [text, next, i + 1];
    if (!value) return;
    if (TITLE_LABEL.test(label.trim()) && !out.title) out.title = value;
    else if (VENUE_LABEL.test(label.trim()) && !out.venue) out.venue = value;
    else if (DATE_LABEL.test(label.trim()) && out.dateAt === undefined) out.dateAt = valueAt;
  });
  return out;
}

// ---------------------------------------------------------------- candidates

/** Lines near a date that are furniture, not a title or a venue. */
const FURNITURE =
  /^(?:\(.*\)|(?:doors?|show)\b.*\d.*|<?https?:.*|\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?(?:\s.{0,24})?|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]{0,6}|(?:google|outlook|apple|ical|yahoo|name|ready|seller notified|helpful information|sale info|ticketmaster|stubhub|axs|-+ ?forwarded message ?-+|complete|accepted|delivered|preparing|purchased|theat(?:er|re)|concerts|sports|transfer pending|log in to your account|general information|go to (?:your|my) .*|review new tickets|\{\{.*\}\}|ages? \d+ ?\+.*|\d+ seats? together|read more)|[\d\s.,$€£#:%x|-]+|.*:\s*|.*\bpresents?\s*:?|\d+\s*x\b.*|\d+\s+(?:items?|tickets?|ticket\(s\)).*|.*\$\s?\d.*|(?:qty|quantity|type|section|sec|row|seats?|price|total|sub ?total|fees?|tax|order|date|time|venue|event|doors?|show|when|where|location|details?|ticket|tickets|ticket info|order info|event information|ticket details|ticket type|ticket\(s\)|your receipt|general admission|ga\d?|my account|order confirm(?:ed|ation)|purchase confirmation|booking reference|order number|order date|purchase date)\b.{0,14}|(?:[a-z ]{2,22}):\s+\S.*|[-–]\s*\d{5}.*|.*\b(?:general admission|admission tier|ga pass|day pass|tier \d)\b.*)$/i;

const SENTENCE =
  /^(?:your|you|you're|we|we'll|hi|hey|hello|dear|thanks|thank|here|here's|get|good news|great news|nice one|congratulations|please|use|keep|view|need|this|if|by|to|our|the following|note|important|click|see|download|add|open|manage|print)\b|[.!?]$|https?:|\b(?:is|are|was|were|will|has|have)\b/i;

function isCandidate(line: string): boolean {
  if (line.length < 2 || line.length > 90) return false;
  if (line.split(/\s+/).length > 14) return false;
  if (FURNITURE.test(line) || SENTENCE.test(line)) return false;
  return /[A-Za-z]/.test(line);
}

const VENUE_WORD =
  /\b(?:theat(?:er|re)|ballroom|arena|hall|auditorium|amphitheat(?:er|re)|nightclub|club|cent(?:er|re)|pier|palace|stadium|pavilion|coliseum|garden|bowl|lounge|warehouse|park|field|studios?|shed|fairgrounds|casino|tavern|lake)\b/i;

/** "859 O'Farrell St., San Francisco, CA": where the venue is, not what it is called. */
const isAddress = (l: string) => /^\d{1,5}\s+\S/.test(l) && /,/.test(l);
/** "San Francisco, CA": a city on its own. */
const isCityLine = (l: string) => /^[A-Za-z .'-]{2,30},\s*[A-Z]{2}(?:\s+\d{5})?$/.test(l);

function splitVenue(raw: string): { venueName: string; city?: string; region?: string } {
  const line = raw.replace(/^at\s+/i, '');
  // "Chase Center — San Francisco, California"
  const dashed = line.split(/\s+[—–]\s+/);
  if (dashed.length === 2) {
    const [city, region] = dashed[1].split(/\s*,\s*/);
    return { venueName: dashed[0].trim(), city: city?.trim(), region: region?.trim() };
  }
  const parts = line.split(/\s*,\s*/).filter(Boolean);
  if (parts.length === 1) return { venueName: parts[0] };
  const region = /^[A-Z]{2}$/.test(parts[parts.length - 1]) ? parts.pop() : undefined;
  const city = parts.length > 1 ? parts.pop() : undefined;
  return { venueName: parts.join(', '), city, region };
}

/** "Portola 2026 - 2-Day GA", "Hamdi - Loyalty Presale" -> the event alone. */
const TICKET_TYPE =
  /\s+[-–|]\s+(?:\d[- ]day\b.*|ga\b.*|vip\b.*|general admission\b.*|admissions?\b.*|.*\bpresale\b.*|.*\bonsale\b.*|resale\b.*|order\s*#.*|mobile.*)$/i;

const stripType = (raw: string) => raw.replace(TICKET_TYPE, '').trim();

/**
 * Every reasonable reading of a title, best first. "A: B" is the act then the
 * production at one seller and the party then the act at another, and nothing
 * in the text says which; the catalog does.
 */
function readings(raw: string): string[] {
  const title = stripType(raw);
  const out = [lineupHeadliner(title), leadingAct(title), billedAct(title), title]
    .filter((t): t is string => !!t)
    .map((t) => cleanArtistName(t))
    .filter((t) => t.length >= 2);
  return [...new Set(out)];
}

/** What the subject says the act is, once the transactional wrapper is off. */
export function nameFromSubject(subject: string): string | undefined {
  const s = decode(subject)
    .replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, '')
    .replace(/^your\s+(.+?)\s+receipt\b.*$/i, '$1')
    .replace(/^\d{1,2}(?::\d{2})?\s*[ap]m\s+(?:today|tonight|tomorrow)\s*:\s*/i, '')
    .replace(/^(?:confirmed\s*[-–:]\s*)?you'?re going to\s+(.+?)[!.]*$/i, '$1')
    .replace(/^your (?:e-?)?tickets?\s*:\s*/i, '')
    .replace(/^thanks for your\s+(.+?)\s+purchase\b.*$/i, '$1')
    .replace(
      /^(?:order confirm(?:ation|ed)(?: for)?|your ticket order|your (?:e-?)?tickets? (?:for|to)|thank you for your order(?: for)?|thanks for your order|you got tickets to|you'?re going to|here are your tickets(?: for)?|booking confirmed(?: for)?|confirmation)\s*[:\-–]?\s*/i,
      '',
    )
    .replace(/\s+@\s+.*$/, '')
    .replace(/\s*[-–|]\s*order\s*#.*$/i, '')
    .replace(/\s*\/\s*[^/]{0,24}$/, '')
    .trim();
  if (s.length < 2 || s.split(/\s+/).length > 16) return undefined;
  if (SENTENCE.test(s) || /^(?:order|your|thanks?|thank)\b/i.test(s) || /\b(?:order id|is confirmed|delivered)\b/i.test(s)) return undefined;
  return stripType(s) || undefined;
}

/** Prose that names the show outright: "You're going to X", "to see X at Y". */
function saidInProse(all: Line[]): { title: string; venueLine?: string } | null {
  for (const { text } of all.slice(0, 40)) {
    const m =
      /\b(?:you'?re going to|guest list for|on your way to see|you'?re seeing|order details for)\s+(.+?)[.!]?$/i.exec(text);
    if (!m) continue;
    const said = m[1].split(/\s+(?:scheduled\s+on|on)\s+(?=\S*\d|(?:mon|tue|wed|thu|fri|sat|sun))/i)[0];
    const cut = said.indexOf(' at ');
    return cut > 1 ? { title: said.slice(0, cut).trim(), venueLine: said.slice(cut + 4).trim() } : { title: said.trim() };
  }
  return null;
}

// ---------------------------------------------------------------- the reader

function readView(view: string, email: NormalizedEmail): LooseTicket | null {
  const all = toLines(view);
  const labels = labelled(all);
  const anchor = findAnchor(all, email.receivedAt, labels.dateAt);
  if (!anchor) return null;

  const prose = saidInProse(all) ?? saidInProse([{ text: decode(email.subject), strong: false }]);
  const subjectName = nameFromSubject(email.subject);
  const taken = (l: string) => !!dateOnLine(l, email.receivedAt) && l.replace(DATEISH, '').replace(/\s+/g, '').length <= 6;

  // Nearest first; the line before the date ahead of the one after it at each distance.
  const near: { text: string; strong: boolean; step: number }[] = [];
  for (const step of [-1, 1, -2, 2, -3, 3, -4, 4, -5]) {
    const l = all[anchor.at + step];
    if (l && !taken(l.text) && (isCandidate(l.text) || /^at\s+\S/i.test(l.text) || isAddress(l.text))) {
      near.push({ ...l, step });
    }
  }

  // ---- venue
  const places = near.filter((l) => !isAddress(l.text));
  // A street address is where the venue is; the line above it is what it is called.
  const addressAt = near.find((l) => isAddress(l.text))?.step;
  const aboveAddress = addressAt !== undefined ? places.find((l) => l.step === addressAt - 1)?.text : undefined;
  const cityLine = places.find((l) => isCityLine(l.text));
  let venueLine =
    labels.venue ??
    prose?.venueLine ??
    aboveAddress ??
    places.find((l) => /^at\s+\S/i.test(l.text))?.text ??
    places.find((l) => !isCityLine(l.text) && (/,\s*[A-Z]{2}$/.test(l.text) || /\s[—–]\s/.test(l.text)))?.text ??
    places.find((l) => !isCityLine(l.text) && VENUE_WORD.test(l.text))?.text;

  // ---- title
  const titleLines = places
    .filter((l) => l.text !== venueLine && !isCityLine(l.text) && !/^at\s+\S/i.test(l.text))
    .sort((a, b) => Number(b.strong) - Number(a.strong));
  const stated = labels.title ?? prose?.title;
  const pool = [stated, subjectName, ...titleLines.map((l) => l.text)].filter((t): t is string => !!t);

  // The subject and the body agreeing is the strongest sign of which line is the act.
  const lower = (s: string) => s.toLowerCase();
  const agreed =
    subjectName && titleLines.find((l) => lower(l.text).includes(lower(subjectName)) || lower(subjectName).includes(lower(stripType(l.text))));
  const title = stated ?? (agreed ? subjectName : (subjectName ?? titleLines[0]?.text));

  // With the title known, an unexplained line beside the date is the venue.
  if (!venueLine && title) {
    venueLine = titleLines.find((l) => Math.abs(l.step) === 1 && !lower(l.text).includes(lower(stripType(title))) && !lower(title).includes(lower(l.text)))?.text;
  }
  if (!title && !venueLine) return null;

  const [best, ...rest] = title ? readings(title) : [];
  const others = pool.filter((t) => t !== title && t !== venueLine).flatMap(readings);
  const venue: { venueName?: string; city?: string; region?: string } = venueLine ? splitVenue(venueLine) : {};
  // "Lightning In A Bottle, Buena Vista Lake": the event's own name, then the place.
  if (best && venue.venueName && venue.city && !venue.region && lower(best).includes(lower(venue.venueName))) {
    venue.venueName = venue.city;
    venue.city = undefined;
  }
  if (cityLine && !venue.city) {
    const [city, region] = cityLine.text.split(/\s*,\s*/);
    Object.assign(venue, { city, region: region?.slice(0, 2) });
  }

  return {
    ...venue,
    artistName: best,
    startsAt: anchor.startsAt,
    alternates: [...new Set([...rest, ...others])].filter((t) => t !== best).slice(0, 4),
  };
}

export function looseExtract(email: NormalizedEmail): LooseTicket | null {
  const fromHtml = email.html ? htmlToText(email.html) : '';
  // The HTML part is the complete one; the text alternative is often degraded.
  const views = [fromHtml, email.text].filter((v) => v && v.trim());
  const both = views.join('\n');
  if (!eligible(email, both)) return null;

  let ticket: LooseTicket | null = null;
  for (const view of views) {
    ticket = readView(view, email);
    if (ticket) break;
  }
  if (!ticket) return null;
  if ([ticket.artistName, ...ticket.alternates].some((t) => t && isSportsTitle(t))) return null;

  const price = findPrice(both);
  return {
    ...ticket,
    ticketRef: findOrderNumber(both) ?? /order\s*#\s*(\d{6,})/i.exec(email.subject)?.[1],
    priceCents: price.cents,
    currency: price.currency,
    ticketQuantity: findTicketQuantity(both) ?? quantityNearby(both),
  };
}

/** "2 Ticket(s)", "3 x General Admission": counts the shared finder misses. */
function quantityNearby(text: string): number | undefined {
  const m = /\b(\d{1,2})\s*(?:ticket\(s\)|x\s+[A-Za-z])/i.exec(text);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n < 50 ? n : undefined;
}
