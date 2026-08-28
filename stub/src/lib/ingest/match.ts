import type { ParsedTicket } from '@/lib/types';
import { findCandidatesForTicket, type TMEvent } from '@/lib/providers/ticketmaster';

/**
 * Turn a parsed ticket into a specific real-world event.
 *
 * The threshold is the whole design here: above AUTO_ADD_THRESHOLD we create the
 * attendance silently, below it the message lands in the review Inbox. That is
 * exactly the Shop behaviour the app is modelled on - most orders appear on
 * their own, the unreadable ones wait for you to confirm them.
 */

export const AUTO_ADD_THRESHOLD = 0.8;

/** Normalize for comparison: casefold, strip punctuation and leading articles. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    // Delete intra-word punctuation rather than spacing it, so "D.C." collapses
    // to "dc" instead of splitting into "d c" and losing the bigram overlap.
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice-coefficient over character bigrams. Robust to the word-order noise in event titles. */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;

  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };

  const ba = bigrams(x);
  const bb = bigrams(y);
  let overlap = 0;
  for (const [g, count] of ba) overlap += Math.min(count, bb.get(g) ?? 0);

  const total = x.length - 1 + (y.length - 1);
  return (2 * overlap) / total;
}

/** One event's headline artist name, preferring the attraction over the event title. */
function eventArtistName(ev: TMEvent): string {
  return ev._embedded?.attractions?.[0]?.name ?? ev.name;
}

function eventStart(ev: TMEvent): number | null {
  const dt = ev.dates?.start?.dateTime;
  if (dt) {
    const t = new Date(dt).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const local = ev.dates?.start?.localDate;
  if (local) {
    const t = new Date(`${local}T00:00:00Z`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export interface ScoredMatch {
  event: TMEvent;
  confidence: number;
  reasons: string[];
}

/**
 * Score one candidate against the parsed ticket.
 *
 * Weighting reflects which signals are actually trustworthy: an exact
 * Ticketmaster event id is decisive, the date is strong, the artist name is
 * strong, venue and city are corroborating.
 */
export function scoreCandidate(ticket: ParsedTicket, ev: TMEvent): ScoredMatch {
  const reasons: string[] = [];

  // A direct id from the email body is as good as it gets.
  if (ticket.tmEventId && ticket.tmEventId === ev.id) {
    return { event: ev, confidence: 1, reasons: ['exact Ticketmaster event id'] };
  }

  let score = 0;
  let weight = 0;

  const name = ticket.artistName ?? ticket.eventName;
  if (name) {
    const s = Math.max(similarity(name, eventArtistName(ev)), similarity(name, ev.name));
    score += s * 0.45;
    weight += 0.45;
    reasons.push(`name ${(s * 100).toFixed(0)}%`);
  }

  if (ticket.startsAt) {
    const want = new Date(ticket.startsAt).getTime();
    const got = eventStart(ev);
    if (!Number.isNaN(want) && got !== null) {
      const hoursApart = Math.abs(want - got) / 3_600_000;
      // Same calendar day is a full point; decays to zero across two days. The
      // slack absorbs emails that give a local date with no timezone.
      const s = hoursApart <= 24 ? 1 : Math.max(0, 1 - (hoursApart - 24) / 48);
      score += s * 0.35;
      weight += 0.35;
      reasons.push(`date ${hoursApart.toFixed(0)}h apart`);
    }
  }

  const venue = ev._embedded?.venues?.[0];
  if (ticket.venueName && venue?.name) {
    const s = similarity(ticket.venueName, venue.name);
    score += s * 0.12;
    weight += 0.12;
    reasons.push(`venue ${(s * 100).toFixed(0)}%`);
  }

  if (ticket.city && venue?.city?.name) {
    const s = similarity(ticket.city, venue.city.name);
    score += s * 0.08;
    weight += 0.08;
    reasons.push(`city ${(s * 100).toFixed(0)}%`);
  }

  // Renormalize so a ticket missing a field is not punished for it, but cap the
  // confidence when we had very little to go on in the first place.
  const confidence = weight === 0 ? 0 : (score / weight) * Math.min(1, weight / 0.8);

  return { event: ev, confidence, reasons };
}

export interface MatchResult {
  best: ScoredMatch | null;
  autoAdd: boolean;
  alternatives: ScoredMatch[];
}

export async function matchTicket(ticket: ParsedTicket): Promise<MatchResult> {
  const candidates = await findCandidatesForTicket(ticket);
  if (candidates.length === 0) return { best: null, autoAdd: false, alternatives: [] };

  const scored = candidates
    .map((ev) => scoreCandidate(ticket, ev))
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const runnerUp = scored[1];

  // If the top two are near-identical we cannot honestly pick one; send it to
  // review even when the raw score is high (two nights of the same tour).
  const ambiguous = runnerUp !== undefined && best.confidence - runnerUp.confidence < 0.05;

  return {
    best,
    autoAdd: best.confidence >= AUTO_ADD_THRESHOLD && !ambiguous,
    alternatives: scored.slice(0, 5),
  };
}
