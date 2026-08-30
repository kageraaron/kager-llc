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
 * The ORIGINAL send date, from the forward header.
 *
 * `receivedAt` is what resolves a year-less date — a Tixr confirmation says
 * "Sat Nov 16 at 10:00 PM" and nothing else — so on a forward it has to be the
 * date the vendor sent the mail, not the date someone passed it along.
 *
 * A real Tixr booking for **16 November 2024**, forwarded in 2026, resolved to
 * 16 November **2026**: a show two years in the future that never existed.
 */
const FORWARDED_DATE = /^\s*Date:\s*(.+)$/im;

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

  /*
   * Take the original date when it parses. Gmail writes it as
   * "Tue, Nov 12, 2024 at 9:11 PM", which `Date` does not accept, so the " at "
   * is normalised away first.
   */
  const rawDate = FORWARDED_DATE.exec(source)?.[1]?.trim();
  const parsedDate = rawDate ? new Date(rawDate.replace(/\s+at\s+/i, ' ')) : null;
  const receivedAt =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : email.receivedAt;

  return {
    ...email,
    from: originalFrom,
    subject,
    receivedAt,
    text: stripForwardHeaders(email.text),
  };
}

/**
 * Remove the forward's own header block from the body.
 *
 * Rewriting `from` and `subject` is not enough: the block stays in the text,
 * and it contains a `Date:` line that every date heuristic can see.
 *
 *     ---------- Forwarded message ---------
 *     From: Ticketmaster <customer_support@email.ticketmaster.com>
 *     Date: Mon, Feb 17, 2025 at 7:51 AM        <- not the show
 *     Subject: You Got Tickets To GARETH EMERY
 *     To: <someone@example.com>
 *
 * A real Ticketmaster confirmation forwarded 18 months later was filed under
 * **17 February** — the day it was originally sent — instead of the 21 March
 * show, because `findDate` prefers the earliest-appearing date once no
 * candidate is in the future, and the header sits above the event block.
 *
 * Only the recognised header lines are dropped, and only immediately after the
 * marker, so a body that happens to contain "Date:" further down is untouched.
 */
const FORWARD_HEADER_LINE = /^\s*(?:From|Date|Subject|To|Cc|Bcc|Reply-To|Sent)\s*:/i;

export function stripForwardHeaders(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /-+\s*Forwarded message\s*-+/i.test(l));
  if (start === -1) return text;

  let end = start + 1;
  // Header lines, plus the blank lines that separate them from the body.
  while (end < lines.length && (FORWARD_HEADER_LINE.test(lines[end]) || lines[end].trim() === '')) {
    end++;
  }

  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
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
