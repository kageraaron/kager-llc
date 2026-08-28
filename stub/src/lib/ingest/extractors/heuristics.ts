/**
 * Shared text heuristics for ticket emails that carry no JSON-LD.
 *
 * These are intentionally conservative: it is much better to return undefined
 * and let the message land in the review Inbox than to invent a wrong date and
 * silently create a bogus event.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_ALT = Object.keys(MONTHS).join('|');

/** `8:00 PM`, `20:00`, `8 PM` -> [hour, minute] in 24h, or null. */
function parseTime(s: string): [number, number] | null {
  const ampm = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i.exec(s);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === 'p') h += 12;
    return [h, Number(ampm[2] ?? 0)];
  }
  const h24 = /\b(\d{1,2}):(\d{2})\b/.exec(s);
  if (h24) {
    const h = Number(h24[1]);
    const m = Number(h24[2]);
    if (h < 24 && m < 60) return [h, m];
  }
  return null;
}

function iso(y: number, mo: number, d: number, time: [number, number] | null): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const [h, mi] = time ?? [0, 0];
  // No timezone suffix on purpose: this is local wall time. The matcher treats
  // it as approximate and searches a +/- 2 day window around it.
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`;
}

/**
 * Find an event date in free text. Handles the formats ticket vendors actually
 * use: "Fri, Mar 14, 2026", "March 14, 2026 at 8:00 PM", "14 March 2026",
 * "03/14/2026". Returns local wall time with no offset.
 */
export function findDate(text: string, opts: { preferFuture?: boolean } = {}): string | undefined {
  const candidates: { date: string; index: number }[] = [];

  // Mon DD, YYYY  (optionally followed by a time on the same or next line)
  const named = new RegExp(
    String.raw`\b(${MONTH_ALT})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})([^\n]{0,40})`,
    'gi',
  );
  for (const m of text.matchAll(named)) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)];
    candidates.push({ date: iso(Number(m[3]), mo, Number(m[2]), parseTime(m[4] ?? '')), index: m.index });
  }

  // DD Mon YYYY
  const dayFirst = new RegExp(
    String.raw`\b(\d{1,2})\s+(${MONTH_ALT})[a-z]*\.?\s+(\d{4})([^\n]{0,40})`,
    'gi',
  );
  for (const m of text.matchAll(dayFirst)) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 3)];
    candidates.push({ date: iso(Number(m[3]), mo, Number(m[1]), parseTime(m[4] ?? '')), index: m.index });
  }

  // MM/DD/YYYY — US order, which is what US ticket vendors send.
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})([^\n]{0,40})/g)) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      candidates.push({ date: iso(Number(m[3]), mo, d, parseTime(m[4] ?? '')), index: m.index });
    }
  }

  if (candidates.length === 0) return undefined;

  if (opts.preferFuture) {
    const now = Date.now();
    const future = candidates
      .filter((c) => new Date(c.date).getTime() >= now - 86_400_000)
      .sort((a, b) => a.index - b.index);
    if (future.length) return future[0].date;
  }

  // Otherwise the earliest-appearing date, which in a confirmation email is
  // nearly always the event date rather than the footer's copyright year.
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0].date;
}

/** Order / confirmation number following a recognizable label. */
export function findOrderNumber(text: string): string | undefined {
  const m =
    /(?:order|confirmation|reference|booking)\s*(?:number|no\.?|#|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,24})/i.exec(
      text,
    );
  return m?.[1];
}

/** Total price in cents, plus its currency symbol if we can see one. */
export function findPrice(text: string): { cents?: number; currency?: string } {
  const m = /(?:order\s+total|total|amount\s+(?:paid|charged)|grand\s+total)\s*[:]?\s*([$£€])\s?([\d,]+\.\d{2})/i.exec(
    text,
  );
  if (!m) return {};
  const cents = Math.round(Number(m[2].replace(/,/g, '')) * 100);
  const currency = { $: 'USD', '£': 'GBP', '€': 'EUR' }[m[1]];
  return { cents: Number.isFinite(cents) ? cents : undefined, currency };
}

/**
 * Venue + city from a line like "The Fillmore, San Francisco, CA".
 * Looked up near a label when one exists, since a bare comma-separated line is
 * too weak a signal on its own.
 */
export function findVenue(text: string): { venueName?: string; city?: string; region?: string } {
  const labeled = /(?:venue|location|where)\s*[:\-]\s*([^\n]{3,80})/i.exec(text);
  const line = labeled?.[1]?.trim();
  if (!line) return {};

  const parts = line.split(/\s*,\s*/).filter(Boolean);
  if (parts.length === 1) return { venueName: parts[0] };

  const region = /^[A-Z]{2}$/.test(parts[parts.length - 1]) ? parts.pop() : undefined;
  const city = parts.length > 1 ? parts.pop() : undefined;
  return { venueName: parts.join(', ') || undefined, city, region };
}

/** Strip the marketing noise vendors wrap around an artist name. */
export function cleanArtistName(raw: string): string {
  return raw
    .replace(/\s*\((?:live|tour|presented by[^)]*)\)/gi, '')
    .replace(/\s*[-–—]\s*(?:the\s+)?\w+\s+tour\b.*$/i, '')
    .replace(/^\s*(?:your tickets? (?:for|to)|you're going to|tickets? for)\s*/i, '')
    // Vendors join the prefix to the artist with a separator ("Order Confirmation: Turnstile").
    .replace(/^\s*[:\-–—|]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
