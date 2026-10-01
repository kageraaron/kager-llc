import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedEmail, ParsedTicket } from '@/lib/types';
import { looksLikeTicketMail, nameFromSubject } from '@/lib/ingest/extractors/loose';
import { isBoilerplateTitle } from '@/lib/ingest/extractors/read';
import { isSportsTitle } from '@/lib/ingest/extractors/vendors';
import { matchTicket, sameShow, similarity, type CatalogCandidate } from '@/lib/ingest/match';
import { persistCandidate } from '@/lib/ingest/catalog';

/**
 * A confirmation that names the show and never says when it is.
 *
 * Some sellers' receipts are like that: a festival order whose only dates are
 * the order's own and a delivery date. Every reader rightly refuses to guess,
 * and the email used to end there, as "no ticket recognised".
 *
 * But the name and the day it was bought are enough to ASK: is there one show
 * by that name, after that day? When the catalog has exactly one answer, that
 * is very likely the ticket, and it is offered as a card to review with the
 * catalog's date on it. Never added to the list on its own: the email did not
 * say which show, the catalog did.
 *
 * It only speaks when it is sure. Several shows by that name (a tour) and no
 * way to choose between them means no card, and the email stays in the
 * Inbox's "couldn't read" list where it was going anyway.
 */

/** How far ahead a ticket is plausibly bought. */
const HORIZON_DAYS = 540;
const NAME_MATCH = 0.82;

/** The show's name, when the email reads like a confirmation and has one. */
export function namedShow(email: NormalizedEmail): string | null {
  // The subject has to do two jobs here, say "this is a confirmation" and name
  // the show, so it is held to the stricter test: the envelope alone.
  if (!looksLikeTicketMail(email)) return null;
  const name = nameFromSubject(email.subject);
  if (!name || isBoilerplateTitle(name) || isSportsTitle(name)) return null;
  return name;
}

/** "Head Trip" is "Head Trip 2026": an edition year is not a different name. */
const bare = (s: string) => s.toLowerCase().replace(/\b20\d{2}\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sameName = (a: string, b?: string | null) => !!b && (bare(a) === bare(b) || similarity(bare(a), bare(b)) >= NAME_MATCH);

export interface NamedMatch {
  eventId: string;
  /** The catalog's start, as local wall time, for the card. */
  startsAt: string | null;
  venueName?: string;
  via: 'catalog' | 'provider';
}

/** Exactly one show by this name after the purchase, or nothing. */
export async function findShowByName(
  db: SupabaseClient,
  name: string,
  email: NormalizedEmail,
  userId: string,
): Promise<NamedMatch | null> {
  const from = new Date(email.receivedAt);
  if (Number.isNaN(from.getTime())) return null;
  const until = new Date(from.getTime() + HORIZON_DAYS * 86_400_000);

  // ---- 1. Shows Stub already knows about. Free, and where a festival added
  // by hand or found by Explore will be.
  const { data: known } = await db
    .from('events')
    .select('id, name, starts_at, headliner:artists!events_headliner_id_fkey ( name ), venue:venues ( name )')
    .gte('starts_at', from.toISOString())
    .lte('starts_at', until.toISOString())
    .limit(3000);

  type Known = { id: string; name: string; starts_at: string; headliner: { name: string } | null; venue: { name: string } | null };
  const local = ((known ?? []) as unknown as Known[]).filter((e) => sameName(name, e.name) || sameName(name, e.headliner?.name));
  if (local.length === 1) {
    return { eventId: local[0].id, startsAt: local[0].starts_at, venueName: local[0].venue?.name, via: 'catalog' };
  }
  if (local.length > 1) return null;

  // An old email's show has been and gone; providers list what is coming, so
  // there is nothing to ask them and no reason to spend a metered call.
  if (until.getTime() < Date.now()) return null;

  // ---- 2. The providers, asked with no date.
  const match = await matchTicket({ artistName: name } as ParsedTicket);
  const after = match.alternatives
    .map((s) => s.candidate)
    .filter((c) => {
      const t = c.startsAt ? new Date(c.startsAt).getTime() : NaN;
      return !Number.isNaN(t) && t >= from.getTime() && t <= until.getTime() && (sameName(name, c.name) || sameName(name, c.artistName));
    });

  // Several providers describing one show is one show.
  const shows: CatalogCandidate[] = [];
  for (const c of after) if (!shows.some((s) => sameShow(s, c))) shows.push(c);

  let pick = shows.length === 1 ? shows[0] : null;
  if (!pick && shows.length > 1) {
    // A tour: the date in the reader's own city, if there is exactly one.
    const { data: profile } = await db.from('profiles').select('home_city').eq('id', userId).maybeSingle();
    const home = profile?.home_city?.split(',')[0]?.trim().toLowerCase();
    const near = home ? shows.filter((c) => c.city?.toLowerCase() === home) : [];
    if (near.length === 1) pick = near[0];
  }
  if (!pick) return null;

  const eventId = await persistCandidate(db, pick, { searched: name });
  return eventId ? { eventId, startsAt: pick.startsAt, venueName: pick.venueName ?? undefined, via: 'provider' } : null;
}
