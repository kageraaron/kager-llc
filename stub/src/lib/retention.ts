import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { senderDomain } from '@/lib/ingest/html';
import { TICKET_SENDER_DOMAINS } from '@/lib/ingest/extractors';

/**
 * How long the sender and subject of mail that WASN'T a ticket are kept.
 *
 * Stub never stores an email's body. For mail that wasn't a ticket it keeps
 * the sender and subject only when the sender is a known ticket seller (see
 * `ingestEmail`), and only for this many days: long enough to spot a missed
 * confirmation in the Inbox's "scanned, nothing found" list. After that they
 * are erased. The message id and content hash stay, so a rescan skips them.
 */
export const SKIPPED_MAIL_RETENTION_DAYS = 30;

/** Is this sender one of the ticket sellers Stub knows how to read? */
export function isTicketSender(from: string): boolean {
  const domain = senderDomain(from);
  return TICKET_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

const SKIPPED = ['ignored', 'error', 'duplicate_event'];

export async function eraseOldSkippedMail(admin: SupabaseClient): Promise<number> {
  let erased = 0;

  // 1. Known ticket sellers: past the retention window.
  const cutoff = new Date(Date.now() - SKIPPED_MAIL_RETENTION_DAYS * 86_400_000).toISOString();
  const { data: old, error } = await admin
    .from('ingest_messages')
    .update({ subject: null, from_addr: null })
    .in('status', SKIPPED)
    .lt('received_at', cutoff)
    .not('subject', 'is', null)
    .select('id');
  if (error) throw error;
  erased += old?.length ?? 0;

  // 2. Anyone else: at any age. New mail is never written with these fields
  // (see `ingestEmail`); this clears rows from before that rule.
  for (;;) {
    const { data: rows } = await admin
      .from('ingest_messages')
      .select('id, from_addr')
      .in('status', SKIPPED)
      .not('from_addr', 'is', null)
      .order('id')
      .range(0, 999);
    const strangers = (rows ?? []).filter((r) => !isTicketSender(r.from_addr as string)).map((r) => r.id as string);
    if (strangers.length === 0) break;
    for (let i = 0; i < strangers.length; i += 100) {
      await admin.from('ingest_messages').update({ subject: null, from_addr: null }).in('id', strangers.slice(i, i + 100));
    }
    erased += strangers.length;
    if ((rows ?? []).length < 1000) break;
  }
  return erased;
}
