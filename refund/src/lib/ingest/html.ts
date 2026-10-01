/**
 * Minimal HTML helpers. Deliberately dependency-free: ticket emails are messy
 * table-soup and we only ever need scripts, links, and flattened text, so a
 * full DOM parser would be weight we don't use.
 */

/** Pull the contents of every <script type="application/ld+json"> block. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const m of html.matchAll(re)) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      // A block may be a single object, an array, or an @graph wrapper.
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed && typeof parsed === 'object' && '@graph' in parsed) {
        const g = (parsed as { '@graph': unknown })['@graph'];
        if (Array.isArray(g)) out.push(...g);
        else out.push(parsed);
      } else out.push(parsed);
    } catch {
      // Malformed JSON-LD is common in marketing email; skip it silently.
    }
  }
  return out;
}

const BLOCK_TAGS = /<\/?(?:p|div|tr|br|li|h[1-6]|table|td)\b[^>]*>/gi;

/** Flatten HTML to newline-separated text, good enough for regex extraction. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim();
}

/** All href values in the document, in order. */
export function extractLinks(html: string): string[] {
  return [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
}

/** The domain of the sender address, lowercased. `"X" <a@b.com>` -> `b.com`. */
export function senderDomain(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  return at === -1 ? '' : addr.slice(at + 1);
}
