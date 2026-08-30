import type { Extractor, NormalizedEmail, ParsedTicket } from '@/lib/types';
import { jsonLdExtractor } from '@/lib/ingest/extractors/jsonld';
import { vendorExtractors } from '@/lib/ingest/extractors/vendors';
import { genericExtractor } from '@/lib/ingest/extractors/generic';

/**
 * Order matters, cheapest and most certain first.
 *
 *  1. **JSON-LD** — structured markup beats any regex we could write, and it
 *     covers vendors we have never seen.
 *  2. **Vendor extractors** — for senders that ship plain table-soup HTML.
 *  3. **Generic** — a conservative reader for vendors with no spec at all.
 *     Ticketing is a long tail and the failure mode when a spec is missing is
 *     silence, so this turns "dropped" into "queued for review".
 */
export const extractors: Extractor[] = [jsonLdExtractor, ...vendorExtractors, genericExtractor];

/**
 * Bumped whenever the extractors change in a way that could read an email
 * differently — a new vendor, a fixed regex, a broadened suffix rule.
 *
 * `ingest_messages.extractor_version` records the value that read each message,
 * so a re-scan can reprocess exactly the mail that might now parse better and
 * skip everything already current. Without it the only way to apply a fix to
 * old mail was deleting the ingest history, which also discards the record of
 * what the user confirmed or rejected.
 *
 * History:
 *   1 — TicketWeb/SeatGeek/Tixr added; qualified presale suffixes stripped;
 *       emphasis-wrapped totals read; generic fallback extractor added.
 */
export const EXTRACTOR_VERSION = 2;

export interface ExtractionResult {
  extractor: string;
  ticket: ParsedTicket;
}

/** First extractor that both matches and yields a ticket wins. */
export function runExtractors(email: NormalizedEmail): ExtractionResult | null {
  for (const ex of extractors) {
    if (!ex.match(email)) continue;
    try {
      const ticket = ex.parse(email);
      if (ticket) return { extractor: ex.name, ticket };
    } catch {
      // A malformed email should never take down a whole sync run.
    }
  }
  return null;
}

export { jsonLdExtractor, vendorExtractors, genericExtractor };
export { TICKET_SENDER_DOMAINS } from '@/lib/ingest/extractors/vendors';
