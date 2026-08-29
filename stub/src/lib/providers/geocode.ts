/**
 * Place-name geocoding — Nominatim (OpenStreetMap).
 *
 * Chosen for the same reason MusicBrainz is: free, no key, no user cap. The
 * cost is a hard 1 req/s ceiling and a mandatory descriptive User-Agent, both
 * handled here. Results are cached in Postgres by the caller (`geocodePlace` in
 * `lib/cache.ts`) with a long TTL — a city does not move.
 *
 * This exists so "shows in San Francisco" works without asking the browser for
 * geolocation permission, and so `profiles.home_city` can be turned into the
 * `home_lat` / `home_lng` that were declared in `0001` but never populated.
 */

const BASE = 'https://nominatim.openstreetmap.org/search';

function userAgent(): string {
  return process.env.NOMINATIM_USER_AGENT ?? 'Stub/0.1.0 ( https://github.com/ekager )';
}

export interface Place {
  /** Short label for the UI: "San Francisco, CA". */
  label: string;
  lat: number;
  lng: number;
  country: string | null;
}

export interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  addresstype?: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string;
    country?: string;
    country_code?: string;
  };
}

/**
 * Only settlement- and region-shaped results are useful here. Without this a
 * search for "Fillmore" returns the venue's street address, and the radius
 * search then centres on a building rather than a neighbourhood.
 */
const PLACE_TYPES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'suburb',
  'borough',
  'county',
  'state',
  'province',
  'region',
  'country',
]);

let lastCall = 0;

/** Nominatim's usage policy is an absolute maximum of 1 req/s. */
async function throttle() {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/**
 * "San Francisco, CA" from the address parts.
 *
 * `display_name` is the full comma-separated chain ("San Francisco, California,
 * United States"), which is too long for a chip in the search bar. Prefer the
 * ISO subdivision code ("US-CA" → "CA") over the spelled-out state name.
 *
 * `name` — the matched object's own name — comes first, ahead of the address
 * parts. Nominatim fills `address.city` with the *enclosing* city, so a search
 * for "Brooklyn" (addresstype `suburb`) carries `city: "New York"`: reading the
 * address first would label Brooklyn's coordinates "New York, NY".
 */
function label(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const town = hit.name ?? a.city ?? a.town ?? a.village ?? a.municipality;
  const iso = a['ISO3166-2-lvl4'];
  const region = iso?.includes('-') ? iso.split('-')[1] : a.state;

  const parts = [town, town && region !== town ? region : null].filter(Boolean);
  if (parts.length === 0) return hit.display_name?.split(',')[0]?.trim() ?? '';
  // Disambiguate non-US places, where a bare "Melbourne, VIC" is ambiguous.
  if (a.country_code && a.country_code !== 'us' && a.country) parts.push(a.country);
  return parts.join(', ');
}

/**
 * Choose the best result and shape it.
 *
 * Split out from `geocode` and exported so it can be tested directly: the fetch
 * half is throttled to one request per second, which makes exercising the
 * selection rules through the network path needlessly slow.
 */
export function pickPlace(hits: NominatimHit[]): Place | null {
  const hit =
    hits.find((h) => h.addresstype && PLACE_TYPES.has(h.addresstype)) ??
    hits.find((h) => h.class === 'place' || h.class === 'boundary');
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { label: label(hit), lat, lng, country: hit.address?.country ?? null };
}

/**
 * Resolve a free-text place name to coordinates, or null if nothing matched.
 *
 * Never throws: a geocoder outage should degrade the search to "artist only",
 * not break Browse.
 */
export async function geocode(query: string): Promise<Place | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const url = new URL(BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  // Over-fetch so there is something left after the place-type filter.
  url.searchParams.set('limit', '5');

  try {
    await throttle();
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    return pickPlace((await res.json()) as NominatimHit[]);
  } catch {
    return null;
  }
}
