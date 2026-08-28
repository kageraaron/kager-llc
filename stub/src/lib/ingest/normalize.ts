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

/** `Fwd:`, `FW:`, `Fwd :` and friends, possibly stacked. */
const FORWARD_PREFIX = /^\s*(?:(?:fwd?|fw)\s*:\s*)+/i;

/**
 * Gmail's forward header block, e.g.
 *
 *   ---------- Forwarded message ---------
 *   From: Ticketmaster <customer_support@email.ticketmaster.com>
 *   Subject: You Got Tickets To Moby (18+)
 */
const FORWARDED_FROM = /^\s*From:\s*(?:"?([^"<\n]*?)"?\s*)?<?([^\s<>@]+@[^\s<>]+?)>?\s*$/im;
const FORWARDED_SUBJECT = /^\s*Subject:\s*(.+)$/im;

/**
 * Rewrite a forwarded message to look like the original.
 *
 * Without this, forwards are invisible to the pipeline: every vendor extractor
 * keys off the sender domain, and a forward arrives from a personal address.
 * A real case that failed — a Ticketmaster confirmation forwarded from a
 * spouse's Gmail — matched nothing at all.
 *
 * Only the sender and subject are rewritten; the body already contains the
 * original content.
 */
export function unwrapForward(email: NormalizedEmail): NormalizedEmail {
  const looksForwarded =
    FORWARD_PREFIX.test(email.subject) || /-+\s*Forwarded message\s*-+/i.test(email.text);
  if (!looksForwarded) return email;

  const source = email.text || htmlToText(email.html);

  const fromMatch = FORWARDED_FROM.exec(source);
  const subjectMatch = FORWARDED_SUBJECT.exec(source);

  // Prefer the subject carried in the forward header; otherwise strip "Fwd:".
  const subject = subjectMatch?.[1]?.trim() || email.subject.replace(FORWARD_PREFIX, '').trim();

  const originalFrom = fromMatch
    ? `${(fromMatch[1] ?? '').trim()} <${fromMatch[2].trim()}>`.trim()
    : email.from;

  return { ...email, from: originalFrom, subject };
}

export function normalizeEmail(raw: RawEmailInput): NormalizedEmail {
  const html = raw.html ?? '';
  const base: NormalizedEmail = {
    from: raw.from ?? '',
    subject: raw.subject ?? '',
    html,
    text: raw.text?.trim() || htmlToText(html),
    receivedAt: raw.receivedAt ?? new Date().toISOString(),
    providerMsgId: raw.providerMsgId,
  };
  return unwrapForward(base);
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
