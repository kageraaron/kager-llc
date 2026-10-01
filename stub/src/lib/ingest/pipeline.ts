import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedTicket } from '@/lib/types';
import { normalizeEmail, contentHash, type RawEmailInput } from '@/lib/ingest/normalize';
import { EXTRACTOR_VERSION } from '@/lib/ingest/extractors';
import { eligible } from '@/lib/ingest/extractors/loose';
import { isBoilerplateTitle, readTicket } from '@/lib/ingest/extractors/read';
import { isSportsTitle } from '@/lib/ingest/extractors/vendors';
import { llmConfigured, llmJudge } from '@/lib/ingest/llm';
import { findShowByName, namedShow } from '@/lib/ingest/nameOnly';
import { htmlToText } from '@/lib/ingest/html';
import { dedupeKey, mergeTickets } from '@/lib/ingest/dedupe';
import { matchTicket } from '@/lib/ingest/match';
import { persistCandidate, recordAttendance } from '@/lib/ingest/catalog';
import { getHouseholdId } from '@/lib/household';
import { isTicketSender } from '@/lib/retention';


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
  opts: { accountId?: string; source: 'gmail' } = { source: 'gmail' },
): Promise<IngestOutcome> {
  const email = normalizeEmail(raw);
  const hash = contentHash(email);

  /*
   * The Inbox is shared by the household, so dedupe is too: the same
   * confirmation reaching both people's Gmail is one message and one card.
   * Rows are still written with `user_id` (whose inbox it came from); the
   * insert trigger files them under the household.
   */
  const householdId = await getHouseholdId(db, userId);

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
    .eq('household_id', householdId)
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

  /*
   * Three readers. The layout parsers know a seller's email exactly; the
   * loose reader checks their work and stands in where none of them applies
   * (`readTicket`); and when both come up empty on mail that still reads like
   * a confirmation, a model reads the one email, if a key is configured.
   * Whatever they produce still has to be borne out by the catalog below, and
   * a read that only the loose reader or the model vouches for is never added
   * to the list without a person confirming it.
   */
  let extraction: { extractor: string; ticket: ParsedTicket; reviewOnly?: boolean } | null = readTicket(email);
  /*
   * The model reads only what nothing else could. It does NOT overrule the
   * loose reader: tried as a judge of "is this ticket held?" on 36 real
   * emails, it dismissed three and all three were real purchases, while the
   * mail that deserved dismissing had already been caught by plain rules.
   */
  let notHeld = false;
  if (!extraction && llmConfigured()) {
    const body = `${email.html ? htmlToText(email.html) : ''}\n${email.text}`;
    if (eligible(email, body)) {
      const verdict = await llmJudge(email);
      const act = verdict?.ticket?.artistName;
      if (verdict?.ticket && act && !isSportsTitle(act) && !isBoilerplateTitle(act)) {
        extraction = { extractor: 'llm', ticket: verdict.ticket, reviewOnly: true };
      }
      // Only stops the name-only lookup below; never removes a card.
      if (verdict && !verdict.held) notHeld = true;
    }
  }

  /*
   * What is kept about a message that was read. Never the body. The sender and
   * subject are kept only when the mail IS a ticket, or comes from a known
   * ticket seller (so a confirmation the extractors missed can still be found
   * in the Inbox's "scanned, nothing found" list, for 30 days: lib/retention).
   *
   * Everything else leaves no readable trace. The Gmail search also matches on
   * subject phrases like "your order", which catches pharmacy receipts and the
   * like: none of Stub's business, and exactly what should not sit in a
   * database. The id and content hash stay so a rescan skips the message.
   */
  const keepHeaders = !!extraction || isTicketSender(email.from);

  const { data: message, error: msgErr } = await db
    .from('ingest_messages')
    .insert({
      user_id: userId,
      account_id: opts.accountId ?? null,
      provider_msg_id: email.providerMsgId ?? null,
      from_addr: keepHeaders ? email.from.slice(0, 320) : null,
      subject: keepHeaders ? email.subject.slice(0, 500) : null,
      received_at: email.receivedAt,
      content_hash: hash,
      extractor_version: EXTRACTOR_VERSION,
      extractor: extraction?.extractor ?? null,
      status: extraction ? 'parsed' : 'ignored',
    })
    .select('id')
    .single();

  if (msgErr) return { status: 'error', message: msgErr.message };

  /*
   * Nobody could read it, but it names a show: ask the catalog whether there
   * is exactly one by that name after the purchase (see nameOnly.ts). A card
   * to review, with the catalog's date; skipped when the show is already on
   * the list, or a model has said the ticket is not held.
   */
  if (!extraction) {
    const name = notHeld ? null : namedShow(email);
    if (!name) return { status: 'not_a_ticket' };
    try {
      const found = await findShowByName(db, name, email, userId);
      if (!found) return { status: 'not_a_ticket' };

      const { count: already } = await db
        .from('attendances')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
        .eq('event_id', found.eventId);
      const { count: queued } = await db
        .from('ingest_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
        .eq('matched_event_id', found.eventId)
        .in('state', ['pending', 'confirmed', 'rejected']);
      if ((already ?? 0) > 0 || (queued ?? 0) > 0) {
        await db.from('ingest_messages').update({ status: 'duplicate_event' }).eq('id', message.id);
        return { status: 'duplicate' };
      }

      const parsed: ParsedTicket = {
        eventName: name,
        venueName: found.venueName,
        startsAt: found.startsAt ?? undefined,
      };
      const { data: candidate } = await db
        .from('ingest_candidates')
        .insert({
          message_id: message.id,
          user_id: userId,
          parsed,
          dedupe_key: dedupeKey(parsed),
          // The name matched and the catalog had one answer; the email gave no date to confirm it.
          confidence: 0.6,
          matched_event_id: found.eventId,
          state: 'pending',
        })
        .select('id')
        .single();
      await db.from('ingest_messages').update({ status: 'unmatched', extractor: 'name-only' }).eq('id', message.id);
      return { status: 'needs_review', candidateId: candidate?.id ?? '', confidence: 0.6 };
    } catch (err) {
      console.error('name-only lookup failed', err instanceof Error ? err.message.slice(0, 160) : err);
      return { status: 'not_a_ticket' };
    }
  }

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
      .eq('household_id', householdId)
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
    /*
     * A loose read can be unsure WHICH line is the act ("Party: Act" and
     * "Act: Production" look the same), so it carries its other readings. If
     * the first is not borne out by a listing, try the next two. The catalog
     * settles what the text cannot.
     */
    const alternates = (extraction.ticket as { alternates?: string[] }).alternates ?? [];
    for (const name of alternates.slice(0, 2)) {
      if (match.autoAdd || (match.best && match.best.confidence >= 0.7)) break;
      const second = await matchTicket({ ...extraction.ticket, artistName: name });
      if (second.best && (!match.best || second.best.confidence > match.best.confidence)) {
        match = second;
        extraction.ticket = { ...extraction.ticket, artistName: name };
      }
    }
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

  if (match.autoAdd && !extraction.reviewOnly) {
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
