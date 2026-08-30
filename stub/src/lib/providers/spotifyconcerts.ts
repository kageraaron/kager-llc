/**
 * Spotify concert data, via the `spotify81` RapidAPI proxy.
 *
 * Distinct from `providers/spotify.ts`, which is the OAuth "import my
 * favourites" flow and is hard-capped at 5 authorized users. This one needs no
 * user consent at all — it reads Spotify's public concert graph through a
 * proxy, so it has no per-user cap and works for everyone in the friend group.
 *
 * What it is unusually good at, measured against the cases this project already
 * cares about:
 *
 *  - **Partial names work.** "Chris L" resolves to Chris Lake and "taylor swif"
 *    to Taylor Swift. Ticketmaster matches whole words only and returns zero for
 *    both — the complaint that opens TODO §4.
 *  - **Canonical artist identity.** A Spotify artist id, so "Taylor Swift" is
 *    the real one, not the tribute act at Warner Vineyards that Ticketmaster's
 *    loose attraction matching surfaces.
 *  - **It sees the club circuit.** Overmono + Ben UFO at Public Works, SF is in
 *    here. That show is absent from *both* JamBase and Ticketmaster and is the
 *    reason manual entry exists (TODO §5.7).
 *
 * What it CANNOT do: location-only search. There is no "what's on near me"
 * endpoint — `geoHash` is accepted and echoed back but `nearby` is resolved from
 * the proxy's own server location (it answers "Montreal") and comes back empty.
 * So this complements JamBase rather than replacing it: artist queries here,
 * location queries there.
 *
 * It also answers in SPANISH, and cannot be asked not to. That corrupts nothing
 * we depend on for matching — artist names, dates, venues and ids all come back
 * clean — but it does reach the generated event TITLE. See `titleFor`.
 *
 * ## Why not the official Spotify Web API
 *
 * Because concerts are not in it. The public Web API covers albums, artists,
 * tracks, playlists, player, search and audiobooks; there is no live-events,
 * tour-date or ticketing endpoint anywhere in it. Spotify's concert graph lives
 * behind an internal partner API — the `spotify:concert:` URIs and
 * open.spotify.com/concert pages — which is what this proxy wraps and what
 * makes the proxy necessary rather than merely convenient.
 *
 * The Web API would additionally be a dead end for a friend-group app: an app
 * in development mode is capped at 5 allowlisted users, and extended quota mode
 * has required an organisation with 250,000+ monthly active users since May
 * 2025. That cap is why `providers/spotify.ts` is a per-user connection rather
 * than the sign-in method.
 *
 * It IS the right source for artist metadata if the artwork here ever proves
 * unreliable: `GET /v1/artists/{id}` takes the same Spotify artist id the
 * concert payload gives us, and the client-credentials flow authorizes no users
 * at all, so the 5-user cap does not apply to it.
 *
 * BILLING: the free plan is **1000 requests per month** — by a wide margin the
 * tightest limit of any provider here. Every call site must go through the
 * cache in `lib/cache.ts`, and `isConfigured()` lets callers degrade to JamBase
 * when the key is absent or the quota is gone.
 */

const HOST = 'spotify81.p.rapidapi.com';
const BASE = `https://${HOST}`;

export function isConfigured(): boolean {
  return !!process.env.RAPID_API_KEY;
}

// ---------------------------------------------------------------- raw shapes

interface RawArtistRef {
  id?: string;
  uri?: string;
  name?: string;
  imageUrl?: string | null;
}

interface RawConcert {
  id?: string;
  uri?: string;
  title?: string;
  startDateIsoString?: string;
  city?: string | null;
  country?: string | null;
  region?: string | null;
  venueName?: string | null;
  venueId?: string | null;
  coordinates?: { latitude?: number; longitude?: number } | null;
  festival?: boolean;
  status?: string | null;
  shareUrl?: string | null;
  /** Top-level refs carry a NAME only. The images live under `details`. */
  artists?: RawArtistRef[];
  /** Present only with `details=true`; the richer view of the same concert. */
  details?: { artists?: RawArtistRef[] } | null;
}

interface RawResponse {
  success?: boolean;
  data?: {
    artist?: { id?: string; name?: string; imageUrl?: string } | null;
    concerts?: { concerts?: RawConcert[] } | null;
  } | null;
  error?: unknown;
}

// ---------------------------------------------------------------- our shapes

export interface SpotifyArtist {
  id: string;
  name: string;
  imageUrl: string | null;
}

/**
 * One billed act. `id` and `imageUrl` come from the `details` view and are the
 * only artist artwork any provider in the cascade offers for a club show — the
 * reason a Monarch booking used to render with a blank thumbnail.
 */
export interface SpotifyLineupArtist {
  name: string;
  spotifyArtistId: string | null;
  imageUrl: string | null;
}

export interface SpotifyConcert {
  /** Spotify concert id, e.g. `5bSV3ieWzSeLBTO5mkAART`. */
  id: string;
  title: string;
  /** Normalised to a real ISO instant; the API emits `2026-08-30T13:00+01:00`. */
  startsAt: string;
  city: string | null;
  region: string | null;
  country: string | null;
  venueName: string | null;
  /** Null on some rows even when `venueName` is present — see `upsertSpotifyEvent`. */
  venueId: string | null;
  lat: number | null;
  lng: number | null;
  isFestival: boolean;
  url: string | null;
  /** Full billed lineup, in the API's order. */
  artists: string[];
  /** The same lineup with whatever ids and artwork the `details` view carried. */
  lineup: SpotifyLineupArtist[];
}

export interface ArtistConcerts {
  artist: SpotifyArtist | null;
  concerts: SpotifyConcert[];
  /** Monthly requests left, from the response headers. Null if not reported. */
  quotaRemaining: number | null;
}

/** Lowercased, stripped to alphanumerics, so "The Fratellis" ≡ "thefratellis". */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Does the artist the API picked plausibly answer the query?
 *
 * The search has no relevance floor — it always returns *something*. Querying
 * "zzzznotanartist" confidently answers with the band "Zzz.". Left unchecked
 * that puts a wrong artist name on screen, so the caller needs a way to reject
 * a fuzzy miss.
 *
 * Prefix matching in the *forward* direction is the good case and must be kept:
 * that is exactly what makes "Chris L" → Chris Lake work. The reverse direction
 * is where the nonsense lives ("zzz" is a prefix of "zzzznotanartist"), so it is
 * only accepted when the query barely overruns the name.
 */
export function matchesQuery(query: string, artistName: string): boolean {
  const q = norm(query);
  const a = norm(artistName);
  if (!q || !a) return false;
  if (a.startsWith(q)) return true;
  return q.startsWith(a) && q.length - a.length <= 3;
}

/**
 * `2026-08-30T13:00+01:00` → a real ISO instant.
 *
 * Note the missing seconds. `Date` handles both that and the `Z` form, but the
 * raw string must never reach Postgres unnormalised.
 */
function toIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Merge the two views of the billed lineup.
 *
 * The top-level `artists` array carries names only; `details.artists` carries
 * the same acts with their Spotify id and artwork. Names are the join key
 * because the two views agree on them and on nothing else reliably.
 */
function mergeLineup(raw: RawConcert): SpotifyLineupArtist[] {
  const detailed = new Map<string, RawArtistRef>();
  for (const a of raw.details?.artists ?? []) {
    if (a.name) detailed.set(norm(a.name), a);
  }

  const order = (raw.artists ?? []).length ? raw.artists ?? [] : raw.details?.artists ?? [];
  const out: SpotifyLineupArtist[] = [];
  for (const a of order) {
    if (!a.name) continue;
    const rich = detailed.get(norm(a.name));
    out.push({
      name: a.name,
      spotifyArtistId: rich?.id ?? a.id ?? rich?.uri?.split(':').pop() ?? null,
      imageUrl: rich?.imageUrl ?? a.imageUrl ?? null,
    });
  }
  return out;
}

/**
 * Separators Spotify uses to join a lineup into a title.
 *
 * ## Why the titles come back in Spanish
 *
 * Spotify builds a multi-act concert title server-side and localizes it from
 * the request's `Accept-Language`. Fetching the same concert page directly
 * proves it — one URL, two languages:
 *
 *   Accept-Language: en-US -> "Silva Bumpa, Dean Turnley Tickets San Francisco…"
 *   Accept-Language: es-ES -> "Entradas para Silva Bumpa y Dean Turnley en…"
 *
 * **This proxy sends a Spanish one upstream, and nothing we do changes that.**
 * Verified on 2026-08-29 against `/partner/concert`, which returned
 * "Silva Bumpa y Dean Turnley" for all three of:
 *
 *   - a plain request;
 *   - `Accept-Language: en-US` set on the call to the proxy (not forwarded);
 *   - `locale=en_US`, `market=US` and `language=en` as query parameters.
 *
 * The endpoint has no locale parameter to pass — `query`, `details`,
 * `detailsLimit`, `geoHash`, `includeNearby` and `parsed` are the entire
 * surface. So the title cannot be fixed at the source and is rebuilt from the
 * lineup instead; see `titleFor`.
 *
 * Not to be confused with the proxy's GEO default, which resolves to Montreal
 * (see the module header on `nearby`). Location and language are separate axes
 * here — a Montreal server would give French "et", not Spanish "y".
 *
 * The separators below therefore have to cover more than Spanish: whatever
 * locale this proxy is pinned to could change under us, and the same rebuild
 * should keep working when it does.
 */
const TITLE_SEPARATORS =
  /\s*(?:,|&|\+|\band\b|\by\b|\be\b|\bet\b|\bund\b|\ben\b|\bi\b|\boch\b|\bog\b|\bja\b|\bmed\b)\s*/gi;

/** "A" / "A and B" / "A, B and C" — the English join Spotify would have used. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The event title, with a generated lineup join rewritten in English.
 *
 * The rewrite is applied ONLY when the provider's title is demonstrably nothing
 * but the lineup joined together: split it on every separator and conjunction
 * we know of, and require the pieces to be exactly the set of billed acts. A
 * promoter's real title ("Goldrush: Midnight Riders", "Leeds Festival 2026")
 * does not survive that test and is passed through untouched, which is the
 * important half — those titles carry information the lineup does not.
 *
 * The test also fails safe on a name that CONTAINS a conjunction ("Y La Bamba"
 * splits into "La Bamba", which no longer matches the lineup), so the worst
 * case is that we leave the provider's title alone.
 */
export function titleFor(rawTitle: string, lineup: SpotifyLineupArtist[]): string {
  const names = lineup.map((a) => a.name);
  if (names.length === 0) return rawTitle;
  if (names.length === 1) return rawTitle.trim() === names[0].trim() ? names[0] : rawTitle;

  const parts = rawTitle.split(TITLE_SEPARATORS).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== names.length) return rawTitle;

  const billed = new Set(names.map(norm));
  if (!parts.every((p) => billed.has(norm(p)))) return rawTitle;

  return joinNames(names);
}

/** Pure: raw row → our shape, or null if it lacks an id or a usable date. */
export function normalizeConcert(raw: RawConcert): SpotifyConcert | null {
  const id = raw.id ?? raw.uri?.split(':').pop();
  const startsAt = toIso(raw.startDateIsoString);
  if (!id || !startsAt) return null;

  const lineup = mergeLineup(raw);

  return {
    id,
    title: titleFor(raw.title ?? 'Untitled', lineup),
    startsAt,
    city: raw.city ?? null,
    region: raw.region ?? null,
    country: raw.country ?? null,
    venueName: raw.venueName ?? null,
    venueId: raw.venueId ?? null,
    lat: raw.coordinates?.latitude ?? null,
    lng: raw.coordinates?.longitude ?? null,
    isFestival: !!raw.festival,
    url: raw.shareUrl ?? null,
    artists: lineup.map((a) => a.name),
    lineup,
  };
}

/**
 * Which artist to show on the card.
 *
 * Never "the first one in the lineup". A festival row lists its bill in the
 * promoter's order: searching Overmono returns WILDLANDS, whose 25-name lineup
 * starts with John Summit and has Overmono tenth. Showing the first name is the
 * bug §5.6 already fixed once for JamBase ("Overmono" surfacing as "Robyn").
 *
 * Festivals keep a null headliner, matching `upsertJamBaseEvent` — the event
 * name is the label for those.
 */
export function headlinerOf(concert: SpotifyConcert, searched?: string): string | null {
  if (searched) {
    const q = norm(searched);
    const hit = concert.artists.find((a) => norm(a) === q) ?? concert.artists.find((a) => norm(a).startsWith(q));
    if (hit) return hit;
  }
  if (concert.isFestival) return null;
  return concert.artists[0] ?? null;
}

// ---------------------------------------------------------------- the call

/**
 * Concerts for an artist, by free-text name.
 *
 * `details=true` and `parsed=true` are BOTH required and are not optional
 * tuning. `parsed` flattens Spotify's GraphQL nesting into usable rows, but on
 * its own leaves `venueName`, `coordinates`, `country` and `region` null —
 * `details` is what populates them. Without the pair you get a city and nothing
 * else, which is not enough to place a show.
 */
export async function searchArtistConcerts(query: string): Promise<ArtistConcerts> {
  const key = process.env.RAPID_API_KEY;
  if (!key) throw new Error('RAPID_API_KEY is not set');

  const url = new URL('/partner/search-concert-artists', BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('details', 'true');
  url.searchParams.set('parsed', 'true');

  const res = await fetch(url, {
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key, Accept: 'application/json' },
    next: { revalidate: 3600 },
  });

  const remainingHeader = res.headers.get('x-ratelimit-requests-remaining');
  const quotaRemaining = remainingHeader === null ? null : Number(remainingHeader);

  if (!res.ok) {
    throw new Error(`spotify concerts search failed: ${res.status}`);
  }

  const body = (await res.json()) as RawResponse;
  if (!body.success || !body.data) {
    throw new Error('spotify concerts search returned no data');
  }

  // 1000 requests a MONTH. Worth a log line long before it runs out, because
  // the failure mode is a silent degrade to JamBase.
  if (quotaRemaining !== null && quotaRemaining < 100) {
    console.warn(`RapidAPI Spotify quota low: ${quotaRemaining} requests left this month`);
  }

  const rawArtist = body.data.artist;
  const artist: SpotifyArtist | null =
    rawArtist?.id && rawArtist.name
      ? { id: rawArtist.id, name: rawArtist.name, imageUrl: rawArtist.imageUrl ?? null }
      : null;

  // A fuzzy miss ("zzzznotanartist" → "Zzz.") is reported as no artist rather
  // than as a confident wrong answer.
  if (artist && !matchesQuery(query, artist.name)) {
    return { artist: null, concerts: [], quotaRemaining };
  }

  const concerts = (body.data.concerts?.concerts ?? [])
    .map(normalizeConcert)
    .filter((c): c is SpotifyConcert => c !== null);

  return { artist, concerts, quotaRemaining };
}

// ---------------------------------------------------------------- geo filter

/** Great-circle distance in miles. */
export function milesBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Narrow an artist's tour to one region.
 *
 * The API answers only "where is this artist playing", worldwide — there is no
 * server-side geo filter to ask for. But every row carries coordinates, so
 * "Overmono near San Francisco" can be answered locally from the one response
 * already fetched, without spending a second request.
 *
 * Rows with no coordinates are dropped rather than kept: an unplaceable show
 * cannot be claimed to be nearby.
 */
export function withinRadius(
  concerts: SpotifyConcert[],
  lat: number,
  lng: number,
  miles: number,
): SpotifyConcert[] {
  return concerts.filter(
    (c) => c.lat !== null && c.lng !== null && milesBetween(lat, lng, c.lat, c.lng) <= miles,
  );
}
