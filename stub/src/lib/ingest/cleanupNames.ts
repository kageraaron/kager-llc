import { cleanArtistName } from '@/lib/ingest/extractors/heuristics';

/**
 * Repairing artist names that were stored before the extractors knew better.
 *
 * These rows come from "Add it anyway" (`createEventFromCandidate`), which
 * takes the email's parsed name and uses it for BOTH the event and the artist.
 * When the parse was poor, the junk lands in the catalog twice:
 *
 *     Day Trip Digital Tickets : Order #175815029
 *     Your tickets: Black Book Records - Miami Music Week
 *     MMW26: ODD MOB @ MIDLINE 03.28
 *     Max Styler - Artist Presale
 *
 * ## Why this cannot ask a provider
 *
 * The obvious repair is "look the event up and take its artist". Every one of
 * these has `matched_a_provider = false` — they exist precisely because no
 * provider had them. There is nothing to ask; the string is all there is.
 *
 * ## So it only ever SUBTRACTS
 *
 * Every rule removes a recognised piece of noise — an order number, a "Your
 * tickets:" prefix, a presale tag, a venue-and-date tail. None rewrites or
 * guesses. That is what makes it safe without a provider to check against:
 * stripping noise cannot turn one artist into a different artist, only into a
 * shorter version of the same one or into nothing (in which case it declines).
 */

/** A leading series or promoter code: "MMW26: ", "EDC: ". */
const SERIES_PREFIX = /^[A-Z0-9]{2,8}:\s+/;

/** "Your tickets:", "Order confirmation for", and friends at the front. */
const NOISE_PREFIX =
  /^(?:your\s+(?:e-?)?tickets?\s*(?:for|to)?\s*:?|order\s+confirmation\s*(?:for)?\s*:?|tickets?\s+(?:for|to)|thanks?\s+for\s+your|thank\s+you\s+for\s+your|confirmation\s+of|receipt\s+for)\s*/i;

/** An order number tacked on the end, with or without a separator. */
const ORDER_SUFFIX = /\s*[:,\-–—]?\s*order\s*#?\s*[A-Z0-9][A-Z0-9/\-]{3,}\s*$/i;

/** "@ MIDLINE 03.28" — a venue and date appended to the act. */
const VENUE_DATE_SUFFIX = /\s*@\s*[^@]{2,40}?\s+\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\s*$/i;

/**
 * A promoter's party billed "<BRAND> w/ <ACTS>".
 *
 * "MACCABI SF w/ ADAM TEN + MITA GAMI" — MACCABI SF is the night, ADAM TEN and
 * MITA GAMI are who played. For a memory app the act is what belongs on the
 * card, and it is also the only half that resolves against any provider.
 *
 * Anchored on "w/" or "with" specifically, and the "+" split only happens AFTER
 * that match. A bare "+" is not enough on its own — "Simon + Garfunkel" is one
 * act's actual name, and splitting it would be a rename, not a cleanup.
 */
const PARTY_WITH_ACTS = /\s+(?:w\/|with)\s+/i;

/** A trailing "Digital Tickets" / "Tickets" that is packaging, not a name. */
const TICKET_WORD_SUFFIX = /\s*[-–—:]?\s*(?:digital\s+|e-?|mobile\s+|print\s+at\s+home\s+)?tickets?\s*$/i;

/**
 * Does this look like it needs repair at all?
 *
 * Deliberately narrow. A name that merely looks unusual is left alone — the
 * cost of a wrong rename is worse than the cost of a name that reads oddly.
 */
export function looksLikeJunkName(name: string): boolean {
  return (
    PARTY_WITH_ACTS.test(name) ||
    ORDER_SUFFIX.test(name) ||
    NOISE_PREFIX.test(name) ||
    VENUE_DATE_SUFFIX.test(name) ||
    SERIES_PREFIX.test(name) ||
    /\border\s*#/i.test(name) ||
    /\bpre-?sale\s*$/i.test(name) ||
    TICKET_WORD_SUFFIX.test(name)
  );
}

/**
 * Propose a cleaned name, or null if nothing safe can be done.
 *
 * Returns null rather than a guess when the result would be empty, unchanged,
 * or implausibly short — leaving a bad name in place is recoverable, replacing
 * it with a worse one is not.
 */
export function proposeCleanName(raw: string): string | null {
  if (!looksLikeJunkName(raw)) return null;

  let name = raw;

  /*
   * "<BRAND> w/ <ACT> + <ACT>" -> the first act. Done first, because the acts
   * half can itself carry a presale tag or an order number.
   */
  if (PARTY_WITH_ACTS.test(name)) {
    const acts = name.split(PARTY_WITH_ACTS).slice(1).join(' with ');
    const first = acts.split(/\s*[+,]\s*/)[0]?.trim();
    if (first && first.length >= 2) name = first;
  }

  // Order matters: strip the tail before the ticket word, or "Order #123"
  // leaves "… Tickets :" behind for the next rule to trip over.
  name = name.replace(ORDER_SUFFIX, '');
  name = name.replace(VENUE_DATE_SUFFIX, '');
  name = name.replace(TICKET_WORD_SUFFIX, '');
  name = name.replace(NOISE_PREFIX, '');
  name = name.replace(SERIES_PREFIX, '');

  // Presale tags, HTML entities and the rest of the shared rules.
  name = cleanArtistName(name);

  // Anything left dangling once a piece was removed from the middle or end.
  name = name.replace(/\s*[:,\-–—]\s*$/, '').replace(/\s+/g, ' ').trim();

  if (name.length < 2) return null;
  if (name === raw) return null;
  // A result that kept almost nothing is a sign the rules misfired.
  if (name.length < 3 && raw.length > 12) return null;

  return name;
}
