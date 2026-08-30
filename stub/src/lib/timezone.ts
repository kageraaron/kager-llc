/**
 * Coarse region -> IANA timezone.
 *
 * Events are rendered in the VENUE's zone (see `lib/format.ts`), so a row with
 * `timezone: null` is not a cosmetic gap — it renders in whatever zone the
 * process happens to be in, which on Vercel is UTC. That is exactly how a 10pm
 * San Francisco show came out as "Mon, Sep 28 · 5:00 AM": the instant was
 * right, the zone to render it in was missing.
 *
 * Providers vary in what they give us:
 *
 *  - Ticketmaster and JamBase report a real IANA zone. Nothing here is needed.
 *  - Bandsintown reports one, but only on its `get_event_details` row.
 *  - The Spotify concerts proxy reports a UTC OFFSET (`-07:00`) and a
 *    `region`/`country` pair, and no zone at all. An offset cannot be turned
 *    into a zone — it does not say which DST rules apply — but a US state or a
 *    Canadian province very nearly can.
 *
 * So this is the last resort, below "ask the provider" and below "reuse the
 * zone another provider already stored on the venue row". It is deliberately
 * coarse: the handful of states split across two zones are mapped to the zone
 * holding the large majority of their population and, more to the point,
 * essentially all of their music venues. Being an hour wrong in western Kansas
 * is a far smaller error than being seven hours wrong everywhere.
 */

/** US states and territories, keyed by USPS code. */
const US_ZONES: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DC: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  IA: 'America/Chicago',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  MA: 'America/New_York',
  MD: 'America/New_York',
  ME: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MO: 'America/Chicago',
  MS: 'America/Chicago',
  MT: 'America/Denver',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  NE: 'America/Chicago',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NV: 'America/Los_Angeles',
  NY: 'America/New_York',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  PR: 'America/Puerto_Rico',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VA: 'America/New_York',
  VT: 'America/New_York',
  WA: 'America/Los_Angeles',
  WI: 'America/Chicago',
  WV: 'America/New_York',
  WY: 'America/Denver',
};

/**
 * Canadian provinces. Worth having: the Spotify proxy answers from a Montreal
 * server and its concert graph is heavy with Canadian dates, so these come up
 * in practice rather than theoretically.
 */
const CA_ZONES: Record<string, string> = {
  AB: 'America/Edmonton',
  BC: 'America/Vancouver',
  MB: 'America/Winnipeg',
  NB: 'America/Moncton',
  NL: 'America/St_Johns',
  NS: 'America/Halifax',
  NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
  ON: 'America/Toronto',
  PE: 'America/Halifax',
  QC: 'America/Toronto',
  SK: 'America/Regina',
  YT: 'America/Whitehorse',
};

/**
 * Best-guess IANA zone for a region code.
 *
 * `country` disambiguates the one collision that matters: "CA" is California in
 * the US table and Canada as a country code. When it is absent — the manual
 * entry form has no country field — the US table is tried first, which is the
 * right default for this app, and the Canadian one only as a fallback for codes
 * that are unambiguously provinces ("ON", "QC", "BC").
 */
export function inferTimezone(region?: string | null, country?: string | null): string | null {
  const key = region?.trim().toUpperCase();
  if (!key) return null;

  const cc = country?.trim().toUpperCase();
  if (cc === 'CA' || cc === 'CAN') return CA_ZONES[key] ?? null;
  if (cc && cc !== 'US' && cc !== 'USA') return null;

  return US_ZONES[key] ?? CA_ZONES[key] ?? null;
}

/**
 * Resolve a naive local wall time against a zone.
 *
 * `2026-09-27T22:00:00` + `America/Los_Angeles` -> `2026-09-28T05:00:00.000Z`.
 * Returns null when the zone is unknown, because there is no honest instant to
 * produce without one — the caller decides what to do about that.
 *
 * Lives here rather than in a provider module because three separate paths need
 * it now: Bandsintown list rows, the manual entry form, and any future importer
 * handing us a wall time.
 */
export function toInstant(local: string, timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  const naive = new Date(`${local.replace(/Z$/, '')}Z`);
  if (Number.isNaN(naive.getTime())) return null;

  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asLocal = new Date(naive.toLocaleString('en-US', { timeZone: timezone }));
  return new Date(naive.getTime() + (asUtc.getTime() - asLocal.getTime())).toISOString();
}
