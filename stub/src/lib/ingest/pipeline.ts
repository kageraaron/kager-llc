import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedTicket } from '@/lib/types';
import { normalizeEmail, contentHash, type RawEmailInput } from '@/lib/ingest/normalize';
import { runExtractors, EXTRACTOR_VERSION } from '@/lib/ingest/extractors';
import { dedupeKey, mergeTickets } from '@/lib/ingest/dedupe';
import { matchTicket } from '@/lib/ingest/match';
import { persistCandidate, recordAttendance } from '@/lib/ingest/catalog';

/**
 * The one path every ingested email takes, whether it arrived via the Gmail
 * poller or the forward address.
 *
 *   normalize -> dedupe -> extract -> match -> (auto-add | review queue)
 *
 * Privacy: only extracted fields and a content hash are persisted. The raw
 * body is never written to the database, which is both the right default and
 * what keeps a future Google CASA assessment tractable.
 */

export type IngestOutcome =
  | { status: 'duplicate' }
  | { status: 'not_a_ticket' }
  | { status: 'auto_added'; eventId: string; confidence: number }
  | { status: 'needs_review'; candidateId: string; confidence: number }
  | { status: 'error'; message: string };

export async function ingestEmail(
  db: SupabaseClient,
  userId: string,
  raw: RawEmailInput,
  opts: { accountId?: string; source: 'gmail' | 'forward' } = { source: 'forward' },
): Promise<IngestOutcome> {
  const email = normalizeEmail(raw);
  const hash = contentHash(email);

  /*
   * Dedupe first: the same confirmation often arrives twice (polled and
   * forwarded).
   *
   * A message already read by the CURRENT extractor version is a duplicate. One
   * read by an older version is reprocessed — that is what makes a re-scan
   * apply a heuristics fix to old mail — unless the user has already acted on
   * it, because a confirmed or rejected candidate is a decision and improving a
   * regex does not reopen it.
   */
  const { data: seen } = await db
    .from('ingest_messages')
    .select('id, extractor_version')
    .eq('user_id', userId)
    .eq('content_hash', hash)
    .limit(1)
    .maybeSingle();

  if (seen) {
    if ((seen.extractor_version ?? 0) >= EXTRACTOR_VERSION) return { status: 'duplicate' };

    const { count: decided } = await db
      .from('ingest_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', seen.id)
      .in('state', ['confirmed', 'rejected']);

    if ((decided ?? 0) > 0) {
      // Already handled by a person. Mark it current so it is not reconsidered.
      await db
        .from('ingest_messages')
        .update({ extractor_version: EXTRACTOR_VERSION })
        .eq('id', seen.id);
      return { status: 'duplicate' };
    }

    /*
     * Reprocessable. Clear any stale PENDING candidate for this message so the
     * re-read replaces it rather than adding a second card for the same email.
     */
    await db.from('ingest_candidates').delete().eq('message_id', seen.id).eq('state', 'pending');
    await db.from('ingest_messages').delete().eq('id', seen.id);
  }

  const extraction = runExtractors(email);

  const { data: message, error: msgErr } = await db
    .from('ingest_messages')
    .insert({
      user_id: userId,
      account_id: opts.accountId ?? null,
      provider_msg_id: email.providerMsgId ?? null,
      from_addr: email.from.slice(0, 320),
      subject: email.subject.slice(0, 500),
      received_at: email.receivedAt,
      content_hash: hash,
      extractor_version: EXTRACTOR_VERSION,
      extractor: extraction?.extractor ?? null,
      status: extraction ? 'parsed' : 'ignored',
    })
    .select('id')
    .single();

  if (msgErr) return { status: 'error', message: msgErr.message };
  if (!extraction) return { status: 'not_a_ticket' };

  /*
   * Is this show already in the queue, or already added?
   *
   * One gig routinely produces several emails — a purchase receipt, then a
   * delivery notice, then a reminder — each with its own content hash, so each
   * became its own review card. A real inbox showed Fred Again twice for
   * exactly that reason.
   *
   * The fingerprint is the SHOW (act + calendar date), not the message, which
   * is the only thing stable across those emails. See `dedupe.ts`.
   */
  const key = dedupeKey(extraction.ticket);
  if (key) {
    const { data: sibling } = await db
      .from('ingest_candidates')
      .select('id, parsed, state')
      .eq('user_id', userId)
      .eq('dedupe_key', key)
      .in('state', ['pending', 'confirmed'])
      .limit(1)
      .maybeSingle();

    if (sibling) {
      /*
       * Fold in whatever this email knows that the first one did not — a
       * delivery notice often carries the seat and quantity a receipt lacked —
       * then stop. No second card, and no second trip through the matcher,
       * which is where the metered providers are.
       */
      const merged = mergeTickets(sibling.parsed as ParsedTicket, extraction.ticket);
      await db.from('ingest_candidates').update({ parsed: merged }).eq('id', sibling.id);
      await db.from('ingest_messages').update({ status: 'duplicate_event' }).eq('id', message.id);
      return { status: 'duplicate' };
    }
  }

  let match;
  try {
    match = await matchTicket(extraction.ticket);
  } catch (err) {
    await db
      .from('ingest_messages')
      .update({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      .eq('id', message.id);
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  // No provider in the cascade had anything plausible. Still queue it for review
  // so the user can add the show by hand rather than losing the signal entirely.
  if (!match.best) {
    const { data: candidate } = await db
      .from('ingest_candidates')
      .insert({
        message_id: message.id,
        user_id: userId,
        parsed: extraction.ticket,
        dedupe_key: key,
        confidence: 0,
        state: 'pending',
      })
      .select('id')
      .single();

    await db.from('ingest_messages').update({ status: 'unmatched' }).eq('id', message.id);
    return { status: 'needs_review', candidateId: candidate?.id ?? '', confidence: 0 };
  }

  const eventId = await persistCandidate(db, match.best.candidate, {
    searched: extraction.ticket.artistName ?? extraction.ticket.eventName,
  });
  if (!eventId) return { status: 'error', message: 'could not persist matched event' };

  if (match.autoAdd) {
    await recordAttendance(db, {
      userId,
      eventId,
      source: opts.source,
      ticketRef: extraction.ticket.ticketRef,
      seatInfo: extraction.ticket.seatInfo,
      priceCents: extraction.ticket.priceCents,
      ticketQuantity: extraction.ticket.ticketQuantity,
      purchasedAt: extraction.ticket.purchasedAt,
    });

    await db
      .from('ingest_candidates')
      .insert({
        message_id: message.id,
        user_id: userId,
        parsed: extraction.ticket,
        dedupe_key: key,
        confidence: match.best.confidence,
        matched_event_id: eventId,
        state: 'confirmed',
      });

    return { status: 'auto_added', eventId, confidence: match.best.confidence };
  }

  const { data: candidate } = await db
    .from('ingest_candidates')
    .insert({
      message_id: message.id,
      user_id: userId,
      parsed: extraction.ticket,
      dedupe_key: key,
      confidence: match.best.confidence,
      matched_event_id: eventId,
      state: 'pending',
    })
    .select('id')
    .single();

  return {
    status: 'needs_review',
    candidateId: candidate?.id ?? '',
    confidence: match.best.confidence,
  };
}
