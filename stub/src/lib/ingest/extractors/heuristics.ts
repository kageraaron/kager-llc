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
export function findDate(
  text: string,
  opts: {
    preferFuture?: boolean;
    /**
     * Accept dates with NO YEAR, resolving them against this reference instant
     * (normally the email's own received date).
     *
     * Off by default, and deliberately so: a bare "01 Oct" is a weak signal
     * that would fire on addresses and footers. DICE is the case that needs it
     * — it renders "Sat 01 Oct,10:00 PM GMT-7" with no year anywhere in the
     * message — and its shape is tight enough (weekday and/or a time attached)
     * to be safe.
     */
    yearlessReference?: string;
  } = {},
): string | undefined {
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

  // Year-less: "Sat 01 Oct, 10:00 PM" / "Oct 01, 10:00 PM". Only consulted when
  // nothing above matched, so a dated message is never second-guessed.
  if (candidates.length === 0 && opts.yearlessReference) {
    const ref = new Date(opts.yearlessReference);
    if (!Number.isNaN(ref.getTime())) {
      const yearless = new RegExp(
        String.raw`\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?` +
          String.raw`(?:(\d{1,2})\s+(${MONTH_ALT})|(${MONTH_ALT})[a-z]*\.?\s+(\d{1,2}))` +
          String.raw`[a-z]*\.?\s*,?\s*([^\n]{0,24})`,
        'gi',
      );

      for (const m of text.matchAll(yearless)) {
        const day = Number(m[1] ?? m[4]);
        const mo = MONTHS[(m[2] ?? m[3]).toLowerCase().slice(0, 3)];
        const time = parseTime(m[5] ?? '');
        // Require a time. Without one this is far too eager — it would fire on
        // any "Suite 900"-shaped fragment that happens to sit near a month name.
        if (!time || !day || day > 31) continue;

        // Choose the year that lands nearest the reference date: a confirmation
        // for "01 Oct" sent in late December means the following year.
        let best: { date: string; delta: number } | null = null;
        for (const y of [ref.getUTCFullYear() - 1, ref.getUTCFullYear(), ref.getUTCFullYear() + 1]) {
          const iso8601 = iso(y, mo, day, time);
          const delta = Math.abs(new Date(`${iso8601}Z`).getTime() - ref.getTime());
          if (!best || delta < best.delta) best = { date: iso8601, delta };
        }
        if (best) candidates.push({ date: best.date, index: m.index });
      }
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

/**
 * Order / confirmation number following a recognizable label.
 *
 * Two traps, both hit by a real Ticketmaster email reading
 * "Order Confirmed / Order # 54-48418/NCA":
 *
 *  - A loose label match captures the next WORD, yielding "Confirmed".
 *    So the candidate must contain a digit.
 *  - Real references contain "/" and other separators, which a
 *    `[A-Z0-9-]` class silently truncates to "54-48418".
 */
export function findOrderNumber(text: string): string | undefined {
  const CANDIDATE = String.raw`([A-Z0-9][A-Z0-9/\-]{3,29})`;

  const LABEL = String.raw`(?:order|confirmation|reference|booking)`;
  // Vendors bracket the value with emphasis marks: AXS's plain-text part reads
  // "Your confirmation number is *46641640*".
  const LEAD = String.raw`[*"'\s]*`;

  // A "#" is the strongest signal, so try that shape first.
  const patterns = [
    new RegExp(LABEL + String.raw`\s*(?:number|no\.?|id)?\s*#` + LEAD + CANDIDATE, 'i'),
    // "... number is 46641640" — a prose connector rather than a colon, which
    // is how AXS and several others phrase it.
    new RegExp(LABEL + String.raw`\s*(?:number|no\.?|id)\s*(?:\(s\))?\s*(?:is|:)` + LEAD + CANDIDATE, 'i'),
    new RegExp(LABEL + String.raw`\s*(?:number|no\.?|id)\s*(?:\(s\))?\s*[:#]?` + LEAD + CANDIDATE, 'i'),
    new RegExp(LABEL + String.raw`\s*[:#]` + LEAD + CANDIDATE, 'i'),
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    // Must look like an identifier, not the next English word.
    if (m && /\d/.test(m[1])) return m[1];
  }
  return undefined;
}

/**
 * Total price in cents, plus its currency symbol if we can see one.
 *
 * Picking "the first thing labelled total" is wrong, and was: real receipts put
 * a SUBTOTAL above the real one. An AXS order reads
 *
 *   Sub Total: $240.00 / Service Fees: $71.64 / Grand Total: $311.64
 *
 * and Frontgate reads "Event Subtotal: $1018.00 ... Total: $1037.95". The old
 * pattern had no word boundary, so "total" matched inside "Subtotal" and the
 * first hit won — recording $240.00 for a $311.64 order, and $1018.00 for a
 * $1037.95 one.
 *
 * So: score every labelled amount and keep the best. Ties go to the LAST one,
 * because a receipt builds up to its total.
 */
const PRICE_LABELS: { re: RegExp; score: number }[] = [
  { re: /grand\s+total/i, score: 3 },
  { re: /amount\s+charged(?:\s+to[^:\n]*)?/i, score: 3 },
  { re: /amount\s+paid/i, score: 3 },
  { re: /order\s+total/i, score: 3 },
  { re: /total\s+charged/i, score: 3 },
  // A bare "Total" is right far more often than not, but loses to the above.
  { re: /total/i, score: 1 },
];

export function findPrice(text: string): { cents?: number; currency?: string } {
  // `\b` before the label is what keeps "Subtotal" from matching "total".
  // `[*_~]*` after the label: a multipart TEXT alternative renders bold as
  // "Total *$608.10*", and without allowing the marker the total is missed
  // entirely — SeatGeek formats every one of its receipts this way.
  const AMOUNT = /\b([A-Za-z][A-Za-z ]{0,24}?total|amount\s+(?:charged|paid)[^:\n$]{0,24}|total)\s*:?\s*[*_~]*\s*([$£€])\s?([\d,]+\.\d{2})/gi;

  let best: { cents: number; currency?: string; score: number } | null = null;

  for (const m of text.matchAll(AMOUNT)) {
    const label = m[1];
    // Subtotals and line items are never the amount the user actually paid.
    if (/sub\s*total|service\s+fee|shipping|tax/i.test(label)) continue;

    const score = PRICE_LABELS.find((l) => l.re.test(label))?.score ?? 0;
    if (score === 0) continue;

    const cents = Math.round(Number(m[3].replace(/,/g, '')) * 100);
    if (!Number.isFinite(cents)) continue;

    // >= so that a later match of equal score wins.
    if (!best || score >= best.score) {
      best = { cents, currency: { $: 'USD', '£': 'GBP', '€': 'EUR' }[m[2]], score };
    }
  }

  if (!best) return {};
  return { cents: best.cents, currency: best.currency };
}

/**
 * How many tickets the order was for.
 *
 * Three shapes, tried strongest first, because they are not equally trustworthy.
 *
 * The third one is the one that needs explaining. `htmlToText` treats `<td>` as
 * a block tag, so a receipt TABLE does not arrive as a row of columns — every
 * cell lands on its own line. A real AXS order table:
 *
 *     Quantity        3-Day General Admission Tier 1
 *     Type            2
 *     Price           $1018.00
 *     Total
 *     4               (Frontgate, right-hand column)
 *     Presale DP
 *     $60.00
 *     $240.00
 *
 * so the quantity is a line holding nothing but a small integer, with a money
 * cell a line or two below it. Anchoring on the words around it does not work —
 * in the AXS layout the header cells are four lines away from their values.
 *
 * Capped at 20 throughout: a larger number in any of these positions is a row
 * count, a seat number or a year, not a personal ticket order.
 */
const MAX_QUANTITY = 20;

function validQuantity(n: number): number | undefined {
  return Number.isInteger(n) && n > 0 && n <= MAX_QUANTITY ? n : undefined;
}

/** A flattened table cell holding a currency amount, e.g. "$1,018.00". */
const MONEY_CELL = /^[$£€]\s?[\d,]+(?:\.\d{2})?$/;

export function findTicketQuantity(text: string): number | undefined {
  // 1. An explicit label. "Quantity: 4", "Qty 2", "Number of tickets: 3".
  const labelled =
    /\b(?:qty|quantity|number\s+of\s+tickets?|no\.?\s+of\s+tickets?|ticket\s+count)\b\s*[:#]?\s*(\d{1,2})\b/i.exec(
      text,
    );
  if (labelled) {
    const n = validQuantity(Number(labelled[1]));
    if (n) return n;
  }

  /*
   * 2. Counted in prose. "3 tickets", "2 x General Admission", and the AXS
   *    transfer phrasing "Alex transferred 3 tickets to you".
   *
   *    A bare "Tickets: 2" is deliberately NOT here: "tickets" is far too common
   *    a word in these emails ("your tickets 2 days before the show") for the
   *    label alone to mean anything.
   */
  const prose =
    /\b(\d{1,2})\s*(?:x\s*)?(?:e-?)?(?:tickets?|passes?|admissions?|guests?)\b/i.exec(text);
  if (prose) {
    const n = validQuantity(Number(prose[1]));
    if (n) return n;
  }

  // 3. A flattened receipt table: an integer-only cell followed closely by money.
  const cells = text.split('\n').map((l) => l.trim());
  for (let i = 0; i < cells.length; i++) {
    if (!/^\d{1,2}$/.test(cells[i])) continue;
    // The money cell is the next one in a 3-column table and the one after in a
    // 4-column one, so look two ahead and no further.
    if (!cells.slice(i + 1, i + 3).some((c) => MONEY_CELL.test(c))) continue;
    const n = validQuantity(Number(cells[i]));
    if (n) return n;
  }

  return undefined;
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
    // Emphasis markers from a multipart TEXT alternative, which renders bold as
    // "*Mipso*". Reading the artist out of the body picks these up, and they
    // would otherwise be stored as part of the name.
    .replace(/^[*_~]+|[*_~]+$/g, '')
    .trim()
    // Age restrictions and format tags are venue metadata, not part of the name.
    .replace(/\s*\((?:\d{1,2}\+|all ages|live|tour|presented by[^)]*)\)/gi, '')
    .replace(/\s*[-–—]\s*(?:the\s+)?\w+\s+tour\b.*$/i, '')
    // Ticket-type suffixes vendors append to the artist: AXS sends
    // "Chris Stussy - Presale" and "Chris Lake - Admissions". A whitelist, not
    // a blanket "drop everything after a dash", which would maul names like
    // "Nine Inch Nails - Trent Reznor" or any legitimately hyphenated act.
    .replace(
      /\s*[-–—]\s*(?:admissions?|general\s+admission|ga|vip|presented\s+by.*|early\s+entry)\s*$/i,
      '',
    )
    /*
     * Presale tags carry a QUALIFIER, and real AXS subjects use several:
     * "Eric Prydz - Artist Presale", "Hamdi - Loyalty Presale",
     * "Parcels - PORTOLA PURCHASER PRESALE". The old pattern only matched a
     * bare "- Presale", so the rest were stored as part of the artist name and
     * then searched for verbatim, which matches nothing anywhere.
     *
     * Anchored at the end and limited to one dash-separated segment, so a
     * hyphenated act keeps its name.
     */
    .replace(/\s*[-–—]\s*[^-–—]{0,40}?\b(?:pre-?sale|on-?sale)\s*$/i, '')
    .replace(/^\s*(?:your tickets? (?:for|to)|you're going to|tickets? for)\s*/i, '')
    // Vendors join the prefix to the artist with a separator ("Order Confirmation: Turnstile").
    .replace(/^\s*[:\-–—|]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
