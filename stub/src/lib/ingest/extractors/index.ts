import type { Extractor, NormalizedEmail, ParsedTicket } from '@/lib/types';
import { jsonLdExtractor } from '@/lib/ingest/extractors/jsonld';
import { vendorExtractors } from '@/lib/ingest/extractors/vendors';

/**
 * Order matters. JSON-LD runs first because structured markup beats any regex
 * we could write, and it covers vendors we have never seen. Vendor extractors
 * are the fallback for senders that ship plain table-soup HTML.
 */
export const extractors: Extractor[] = [jsonLdExtractor, ...vendorExtractors];

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

export { jsonLdExtractor, vendorExtractors };
export { TICKET_SENDER_DOMAINS } from '@/lib/ingest/extractors/vendors';
