import type { ParsedTicket } from '@/lib/types';
import { findCandidatesForTicket, type TMEvent } from '@/lib/providers/ticketmaster';
import * as jambase from '@/lib/providers/jambase';
import type { JBEvent } from '@/lib/providers/jambase';
import * as spotifyconcerts from '@/lib/providers/spotifyconcerts';
import type { SpotifyConcert } from '@/lib/providers/spotifyconcerts';
import * as bandsintown from '@/lib/providers/bandsintown';
import type { BITEvent } from '@/lib/providers/bandsintown';
import * as eventbrite from '@/lib/providers/eventbrite';
import type { EBEvent } from '@/lib/providers/eventbrite';
import { cachedArtistConcerts, cachedBandsintownArtist } from '@/lib/cache';

/**
 * Turn a parsed ticket into a specific real-world event.
 *
 * The threshold is the whole design here: above AUTO_ADD_THRESHOLD we create the
 * attendance silently, below it the message lands in the review Inbox. That is
 * exactly the Shop behaviour the app is modelled on - most orders appear on
 * their own, the unreadable ones wait for you to confirm them.
 */

export const AUTO_ADD_THRESHOLD = 0.8;

/**
 * Below this similarity, two venue names are describing different rooms rather
 * than spelling the same one differently ("The Fillmore" vs "Fillmore" scores
 * 1.0; "Monarch" vs "Pier 80 Warehouse" scores 0.09).
 */
const VENUE_CONTRADICTION = 0.35;

/** Ceiling applied to a candidate the ticket actively disagrees with. */
const CONTRADICTION_CAP = 0.55;

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

/**
 * A candidate event from any provider, normalised so scoring does not care
 * where it came from.
 *
 * `raw` is carried through untouched so that, once a candidate wins, it can be
 * handed to the right catalog upsert.
 */
export type CandidateSource =
  | 'eventbrite'
  | 'ticketmaster'
  | 'jambase'
  | 'spotify'
  | 'bandsintown';

export interface CatalogCandidate {
  source: CandidateSource;
  /** Provider-scoped id. */
  id: string;
  /** Headline artist, when the provider distinguishes it from the title. */
  artistName: string | null;
  /** Event title. */
  name: string;
  startsAt: string | null;
  venueName: string | null;
  city: string | null;
  raw: TMEvent | JBEvent | SpotifyConcert | BITEvent | EBEvent;
}

function msOrNull(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Eventbrite candidates are only ever produced from an id the email itself
 * carried, so there is no fuzzy resolution step and no wrong-artist risk.
 */
export function fromEventbrite(ev: EBEvent): CatalogCandidate {
  return {
    source: 'eventbrite',
    id: ev.id,
    // Eventbrite has no separate artist entity; the event name is the billing.
    artistName: null,
    name: ev.name,
    startsAt: ev.startsAt,
    venueName: ev.venueName,
    city: ev.city,
    raw: ev,
  };
}

export function fromTicketmaster(ev: TMEvent): CatalogCandidate {
  const venue = ev._embedded?.venues?.[0];
  const start = ev.dates?.start?.dateTime ?? (ev.dates?.start?.localDate ? `${ev.dates.start.localDate}T00:00:00Z` : null);
  return {
    source: 'ticketmaster',
    id: ev.id,
    artistName: ev._embedded?.attractions?.[0]?.name ?? null,
    name: ev.name,
    startsAt: start,
    venueName: venue?.name ?? null,
    city: venue?.city?.name ?? null,
    raw: ev,
  };
}

export function fromJamBase(ev: JBEvent, searched?: string): CatalogCandidate {
  return {
    source: 'jambase',
    id: jambase.jbId(ev.identifier) ?? '',
    artistName: jambase.headlinerOf(ev, searched)?.name ?? null,
    name: ev.name ?? '',
    startsAt: jambase.resolveStart(ev),
    venueName: ev.location?.name ?? null,
    city: ev.location?.address?.addressLocality ?? null,
    raw: ev,
  };
}

export function fromSpotify(c: SpotifyConcert, searched?: string): CatalogCandidate {
  return {
    source: 'spotify',
    id: c.id,
    artistName: spotifyconcerts.headlinerOf(c, searched),
    name: c.title,
    startsAt: c.startsAt,
    venueName: c.venueName,
    city: c.city,
    raw: c,
  };
}

/**
 * Bandsintown rows carry a naive local wall time and no zone, so `startsAt` is
 * anchored at UTC here rather than converted.
 *
 * That is not a fudge for scoring purposes: `ticket.startsAt` is itself local
 * wall time whenever the email gave no zone, so the two are usually being
 * compared on the same footing. And the date term awards full credit inside 24
 * hours and decays over the next 48, which absorbs a zone error comfortably
 * larger than any real one. The honest instant is resolved later, at persist
 * time, where `upsertBandsintownEvent` has a venue timezone to work with.
 */
export function fromBandsintown(ev: BITEvent, searched?: string): CatalogCandidate {
  return {
    source: 'bandsintown',
    id: ev.id,
    artistName: ev.artistName ?? searched ?? null,
    name: ev.name,
    startsAt: `${ev.startsAtLocal.replace(/Z$/, '')}Z`,
    venueName: ev.venueName,
    city: ev.city,
    raw: ev,
  };
}

export interface ScoredMatch {
  candidate: CatalogCandidate;
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
export function scoreCandidate(ticket: ParsedTicket, c: CatalogCandidate): ScoredMatch {
  const reasons: string[] = [];

  // A direct id from the email body is as good as it gets.
  if (ticket.tmEventId && c.source === 'ticketmaster' && ticket.tmEventId === c.id) {
    return { candidate: c, confidence: 1, reasons: ['exact Ticketmaster event id'] };
  }
  /*
   * Same reasoning for Eventbrite, and if anything stronger: the candidate was
   * FETCHED BY that id from Eventbrite's own API, so this is not a match at all
   * — it is the event the ticket is for, told to us by the company that sold it.
   */
  if (ticket.ebEventId && c.source === 'eventbrite' && ticket.ebEventId === c.id) {
    return { candidate: c, confidence: 1, reasons: ['exact Eventbrite event id'] };
  }

  let score = 0;
  let weight = 0;

  const name = ticket.artistName ?? ticket.eventName;
  if (name) {
    const s = Math.max(similarity(name, c.artistName ?? c.name), similarity(name, c.name));
    score += s * 0.45;
    weight += 0.45;
    reasons.push(`name ${(s * 100).toFixed(0)}%`);
  }

  const want = msOrNull(ticket.startsAt ?? null);
  const got = msOrNull(c.startsAt);
  if (want !== null && got !== null) {
    const hoursApart = Math.abs(want - got) / 3_600_000;
    // Same calendar day is a full point; decays to zero across two days. The
    // slack absorbs emails that give a local date with no timezone.
    const s = hoursApart <= 24 ? 1 : Math.max(0, 1 - (hoursApart - 24) / 48);
    score += s * 0.35;
    weight += 0.35;
    reasons.push(`date ${hoursApart.toFixed(0)}h apart`);
  }

  let venueContradicts = false;
  if (ticket.venueName && c.venueName) {
    const s = similarity(ticket.venueName, c.venueName);
    score += s * 0.12;
    weight += 0.12;
    reasons.push(`venue ${(s * 100).toFixed(0)}%`);
    venueContradicts = s < VENUE_CONTRADICTION;
  }

  if (ticket.city && c.city) {
    const s = similarity(ticket.city, c.city);
    score += s * 0.08;
    weight += 0.08;
    reasons.push(`city ${(s * 100).toFixed(0)}%`);
  }

  // Renormalize so a ticket missing a field is not punished for it, but cap the
  // confidence when we had very little to go on in the first place.
  let confidence = weight === 0 ? 0 : (score / weight) * Math.min(1, weight / 0.8);

  /*
   * A venue that CONTRADICTS the ticket is not the same as a venue we simply
   * don't know. The plain weighted sum treats both as "adds no credit", which
   * is how this went wrong on a real ticket:
   *
   *   Ticket:    Silva Bumpa, Monarch, San Francisco, 27 Sep
   *   Candidate: Portola (festival), Pier 80 Warehouse, San Francisco, 27 Sep
   *
   * Silva Bumpa really is on the Portola bill, so the artist matched 100%, the
   * city matched, the date was within a day — and the wrong event scored 0.876,
   * over the auto-add line. The venue disagreed completely and carried only
   * 0.12 of the weight, nowhere near enough to matter.
   *
   * So an explicit contradiction caps the score below AUTO_ADD_THRESHOLD. The
   * candidate still surfaces as a review suggestion; it just cannot be applied
   * silently. It also lets the cascade keep going and find the real show.
   */
  if (venueContradicts && confidence > CONTRADICTION_CAP) {
    confidence = CONTRADICTION_CAP;
    reasons.push('venue contradicts — capped');
  }

  return { candidate: c, confidence, reasons };
}

/**
 * Do two candidates describe the SAME show?
 *
 * This matters because the cascade queries several providers, and the good case
 * is that more than one of them has the event. Without collapsing duplicates,
 * two strong scores for one show read as "ambiguous" and the ticket would be
 * pushed to manual review precisely when we are most certain.
 */
export function sameShow(a: CatalogCandidate, b: CatalogCandidate): boolean {
  const ta = msOrNull(a.startsAt);
  const tb = msOrNull(b.startsAt);
  // Providers disagree about start times by hours (doors vs. stage vs. a
  // date-only value anchored at 20:00), so the window is deliberately generous.
  if (ta === null || tb === null || Math.abs(ta - tb) > 12 * 3_600_000) return false;

  const nameSim = Math.max(
    similarity(a.artistName ?? a.name, b.artistName ?? b.name),
    similarity(a.name, b.name),
  );
  const venueSim = a.venueName && b.venueName ? similarity(a.venueName, b.venueName) : 0;

  return venueSim > 0.6 || nameSim > 0.8;
}

export interface MatchResult {
  best: ScoredMatch | null;
  autoAdd: boolean;
  alternatives: ScoredMatch[];
  /** Which providers were actually queried — useful when debugging a miss. */
  consulted: CandidateSource[];
}

/** ±2 days, because emails often carry a local date with no zone. */
const DATE_SLACK_MS = 2 * 86_400_000;

function withinWindow(ticket: ParsedTicket, startsAt: string | null): boolean {
  const want = msOrNull(ticket.startsAt ?? null);
  const got = msOrNull(startsAt);
  if (want === null || got === null) return true;
  return Math.abs(want - got) <= DATE_SLACK_MS;
}

/**
 * The event the email points at, straight from the vendor that sold the ticket.
 *
 * Costs one request against a 2,000/hour allowance, and only ever runs when the
 * email carried an Eventbrite link — so it is free in both senses on every
 * other vendor's mail.
 */
async function eventbriteCandidates(ticket: ParsedTicket): Promise<CatalogCandidate[]> {
  const id = eventbrite.eventIdForTicket(ticket);
  if (!id || !eventbrite.isConfigured()) return [];

  const event = await eventbrite.getEvent(id);
  // An online-only event is not a show anyone attends in a venue; skip it
  // rather than putting a webinar on the calendar.
  if (!event || event.isOnline) return [];

  return [fromEventbrite(event)];
}

async function jambaseCandidates(ticket: ParsedTicket): Promise<CatalogCandidate[]> {
  const keyword = ticket.artistName ?? ticket.eventName;
  if (!keyword || !jambase.isConfigured()) return [];

  const want = msOrNull(ticket.startsAt ?? null);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const { events } = await jambase.searchEvents({
    artistName: keyword,
    startDate: want !== null ? day(want - DATE_SLACK_MS) : undefined,
    endDate: want !== null ? day(want + DATE_SLACK_MS) : undefined,
    perPage: 40,
  });
  return events.map((e) => fromJamBase(e, keyword));
}

async function spotifyCandidates(ticket: ParsedTicket): Promise<CatalogCandidate[]> {
  const keyword = ticket.artistName ?? ticket.eventName;
  if (!keyword || !spotifyconcerts.isConfigured()) return [];

  // Returns the artist's whole tour worldwide; narrow to the date window before
  // scoring so a 36-date tour does not contribute 36 candidates.
  const result = await cachedArtistConcerts(keyword);
  if (!result?.artist) return [];

  return result.concerts
    .filter((c) => withinWindow(ticket, c.startsAt))
    .map((c) => fromSpotify(c, keyword));
}

/**
 * Bandsintown candidates. **Costs a credit** off a ~200-credit balance, so this
 * is the one provider fetch that checks a budget before it runs (inside
 * `cachedBandsintownArtist`) and returns nothing rather than spending when the
 * daily allowance is gone.
 *
 * Like the Spotify path this returns the artist's whole worldwide tour, so it
 * is narrowed to the date window before scoring — otherwise a 36-date tour
 * contributes 36 candidates and drowns the real answer in near-ties.
 */
async function bandsintownCandidates(ticket: ParsedTicket): Promise<CatalogCandidate[]> {
  const keyword = bandsintown.queryForTicket(ticket);
  if (!keyword || !bandsintown.isConfigured()) return [];

  const result = await cachedBandsintownArtist(keyword);
  if (!result?.artist) return [];

  const inWindow = ticket.startsAt
    ? bandsintown.withinDays(result.events, ticket.startsAt, 2)
    : result.events;

  return inWindow.map((e) => fromBandsintown(e, keyword));
}

/**
 * Find the event a ticket refers to, consulting providers in cost order.
 *
 * **Ticketmaster → JamBase → Spotify → Bandsintown**, stopping as soon as a
 * provider yields a confident, unambiguous match. The order is quota economics,
 * not preference — cheapest first, scarcest last:
 *
 * | Provider | Free allowance | Cost of one lookup |
 * |---|---|---|
 * | Ticketmaster | 5,000/day (~150,000/mo) | effectively free |
 * | JamBase | 14-day trial quota | metered |
 * | Spotify (RapidAPI) | 1,000 per MONTH (~33/day) | 1 request |
 * | Bandsintown (Parse) | **~200 credits, 99/day cap** | **1 credit** |
 *
 * The two scarcest sources go last precisely BECAUSE they are the best at club
 * shows: the cascade only reaches them when the cheap providers have already
 * failed, which is exactly the small-venue case they win. Spending scarce quota
 * only on genuine misses beats spending it on every Ticketmaster miss.
 *
 * Bandsintown sits below Spotify despite being the more accurate of the two,
 * because it is roughly 5x scarcer per month and it is the only source whose
 * balance does not visibly refill. When both would answer, the cheaper one
 * should.
 *
 * This ordering is affordable ONLY on the ingestion path. Browse must not walk
 * this cascade on a keystroke — see `api/search/events`, which keeps
 * Bandsintown behind an explicit user action.
 *
 * Real example: an Eventbrite confirmation for Silva Bumpa at Monarch, SF
 * returns **0** candidates from Ticketmaster and no club show from JamBase
 * (whose only same-day SF event is a different one, Portola at Pier 80), while
 * Spotify has Monarch exactly. Overmono @ Public Works, SF is the mirror case:
 * absent from Ticketmaster and JamBase, present in both Spotify and Bandsintown.
 */
export async function matchTicket(ticket: ParsedTicket): Promise<MatchResult> {
  const providers: { source: CandidateSource; run: () => Promise<CatalogCandidate[]> }[] = [
    // First, and free: it only runs when the email handed us an Eventbrite id,
    // and when it does the answer is definitive rather than a best guess.
    { source: 'eventbrite', run: () => eventbriteCandidates(ticket) },
    { source: 'ticketmaster', run: async () => (await findCandidatesForTicket(ticket)).map(fromTicketmaster) },
    { source: 'jambase', run: () => jambaseCandidates(ticket) },
    { source: 'spotify', run: () => spotifyCandidates(ticket) },
    { source: 'bandsintown', run: () => bandsintownCandidates(ticket) },
  ];

  const consulted: CandidateSource[] = [];
  let scored: ScoredMatch[] = [];

  for (const provider of providers) {
    let found: CatalogCandidate[] = [];
    try {
      found = await provider.run();
    } catch (err) {
      // One provider being down must not sink the whole match.
      console.error(`match: ${provider.source} lookup failed`, err);
      continue;
    }
    consulted.push(provider.source);

    scored = [...scored, ...found.map((c) => scoreCandidate(ticket, c))].sort(
      (a, b) => b.confidence - a.confidence,
    );

    const verdict = decide(scored);
    // Stop the moment we are confident: everything below this point costs quota.
    if (verdict.autoAdd) return { ...verdict, consulted };
  }

  return { ...decide(scored), consulted };
}

function decide(scored: ScoredMatch[]): Omit<MatchResult, 'consulted'> {
  const best = scored[0] ?? null;
  if (!best) return { best: null, autoAdd: false, alternatives: [] };

  // Ambiguity is judged only against OTHER shows. A second provider describing
  // the same gig is corroboration, not a competing answer.
  const rival = scored.slice(1).find((s) => !sameShow(best.candidate, s.candidate));
  const ambiguous = rival !== undefined && best.confidence - rival.confidence < 0.05;

  return {
    best,
    autoAdd: best.confidence >= AUTO_ADD_THRESHOLD && !ambiguous,
    alternatives: scored.slice(0, 5),
  };
}
