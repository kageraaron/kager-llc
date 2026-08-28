import { createHash } from 'node:crypto';
import type { NormalizedEmail } from '@/lib/types';
import { htmlToText } from '@/lib/ingest/html';

/**
 * Both ingestion paths - the Gmail poller and the Cloudflare Email Worker -
 * converge here, so everything downstream sees one shape.
 */

export interface RawEmailInput {
  from: string;
  subject: string;
  html?: string;
  text?: string;
  receivedAt?: string;
  providerMsgId?: string;
}

export function normalizeEmail(raw: RawEmailInput): NormalizedEmail {
  const html = raw.html ?? '';
  return {
    from: raw.from ?? '',
    subject: raw.subject ?? '',
    html,
    text: raw.text?.trim() || htmlToText(html),
    receivedAt: raw.receivedAt ?? new Date().toISOString(),
    providerMsgId: raw.providerMsgId,
  };
}

/**
 * Stable fingerprint for deduplication. The same confirmation can arrive twice
 * (Gmail poll plus a manual forward), and `ingest_messages` is unique on
 * (user_id, content_hash) to make that idempotent.
 *
 * We store this hash INSTEAD of the email body, never alongside it.
 */
export function contentHash(email: NormalizedEmail): string {
  return createHash('sha256')
    .update(email.from.toLowerCase())
    .update(' ')
    .update(email.subject)
    .update(' ')
    .update(email.text.slice(0, 4000))
    .digest('hex');
}
