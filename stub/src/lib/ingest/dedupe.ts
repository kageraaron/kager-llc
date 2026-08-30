import type { ParsedTicket } from '@/lib/types';

/**
 * Recognising that two emails describe the same show.
 *
 * One gig routinely produces several messages — a purchase receipt, a "your
 * tickets are ready" delivery notice, sometimes a reminder — each with its own
 * content hash, so each became its own review card. A real inbox showed Fred
 * Again twice for exactly this reason.
 *
 * Content hashing cannot help: the emails genuinely differ. What is stable
 * across them is the SHOW, so that is what gets fingerprinted.
 */

/** Casefold, strip punctuation and a leading article. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * A coarse fingerprint of the show: normalized act plus calendar date.
 *
 * **Date, not time**, on purpose. A purchase receipt and a delivery notice
 * frequently disagree about the hour — one carries doors, the other stage time,
 * and a third has only the date — while agreeing on the night. Including the
 * time would defeat the whole thing.
 *
 * Returns null when either half is missing. A candidate with no name or no date
 * cannot be fingerprinted, and must still reach the review queue rather than
 * being silently collapsed into something unrelated.
 */
export function dedupeKey(ticket: ParsedTicket): string | null {
  const name = ticket.artistName ?? ticket.eventName;
  if (!name || !ticket.startsAt) return null;

  const act = norm(name);
  if (act.length < 2) return null;

  // Slice rather than parse: `startsAt` is local wall time with no zone in most
  // vendors, and `new Date()` on it would shift the day.
  const day = ticket.startsAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  return `${act}:${day}`;
}

/**
 * Fold a newer read of the same show into what we already stored.
 *
 * Later emails are usually *more* informative — a delivery notice carries the
 * seat and the quantity a purchase receipt lacked — so this fills gaps rather
 * than overwriting. Existing values win on conflict: the first email to arrive
 * is normally the purchase, and its price is the one actually paid.
 */
export function mergeTickets(existing: ParsedTicket, incoming: ParsedTicket): ParsedTicket {
  const merged: ParsedTicket = { ...existing };

  for (const [key, value] of Object.entries(incoming) as [keyof ParsedTicket, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}
