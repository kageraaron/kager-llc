import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail, contentHash, type RawEmailInput } from '@/lib/ingest/normalize';
import { runExtractors } from '@/lib/ingest/extractors';
import { matchTicket } from '@/lib/ingest/match';
import { upsertEvent, recordAttendance } from '@/lib/ingest/catalog';

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

  // Dedupe first: the same confirmation often arrives twice (polled and forwarded).
  const { data: seen } = await db
    .from('ingest_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', hash)
    .maybeSingle();
  if (seen) return { status: 'duplicate' };

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
      extractor: extraction?.extractor ?? null,
      status: extraction ? 'parsed' : 'ignored',
    })
    .select('id')
    .single();

  if (msgErr) return { status: 'error', message: msgErr.message };
  if (!extraction) return { status: 'not_a_ticket' };

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

  // Nothing plausible came back from Ticketmaster. Still queue it for review so
  // the user can add the show by hand rather than losing the signal entirely.
  if (!match.best) {
    const { data: candidate } = await db
      .from('ingest_candidates')
      .insert({
        message_id: message.id,
        user_id: userId,
        parsed: extraction.ticket,
        confidence: 0,
        state: 'pending',
      })
      .select('id')
      .single();

    await db.from('ingest_messages').update({ status: 'unmatched' }).eq('id', message.id);
    return { status: 'needs_review', candidateId: candidate?.id ?? '', confidence: 0 };
  }

  const eventId = await upsertEvent(db, match.best.event);
  if (!eventId) return { status: 'error', message: 'could not persist matched event' };

  if (match.autoAdd) {
    await recordAttendance(db, {
      userId,
      eventId,
      source: opts.source,
      ticketRef: extraction.ticket.ticketRef,
      seatInfo: extraction.ticket.seatInfo,
      priceCents: extraction.ticket.priceCents,
      purchasedAt: extraction.ticket.purchasedAt,
    });

    await db
      .from('ingest_candidates')
      .insert({
        message_id: message.id,
        user_id: userId,
        parsed: extraction.ticket,
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
