import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { searchEvents as tmSearchEvents, getAttractionEvents, pickImage } from '@/lib/providers/ticketmaster';
import * as jambase from '@/lib/providers/jambase';
import * as spotifyconcerts from '@/lib/providers/spotifyconcerts';
import * as bandsintown from '@/lib/providers/bandsintown';
import {
  searchCacheKey,
  readSearchCache,
  writeSearchCache,
  geocodePlace,
  cachedArtistConcerts,
  deepSearchForUser,
} from '@/lib/cache';

/**
 * Event search for Browse. Four sources, split by what each is actually good at.
 *
 * **Spotify (RapidAPI) answers artist queries.** It is the only automatic source
 * here that matches partial names — "Chris L" finds Chris Lake, which
 * Ticketmaster returns zero for — and it resolves to a canonical Spotify artist
 * rather than whatever tribute act shares the name. It also has the club
 * circuit: Overmono + Ben UFO at Public Works, SF.
 *
 * **JamBase answers location queries.** Spotify has no "what's on near me"
 * endpoint at all, so anything without an artist name goes here. JamBase also
 * catches the festival appearances Ticketmaster misses.
 *
 * **Ticketmaster is the emergency fallback**, used only when the source above it
 * is unconfigured or failing, so Browse degrades rather than going blank.
 *
 * **Bandsintown is opt-in only, via `?deep=1`.** It is the most accurate source
 * in the app and the scarcest — ~200 credits against a 99/day cap, one credit a
 * query. Browse is debounced at 320ms but still fires on typing, so putting it
 * in the automatic path would spend the entire balance in a single session of
 * someone playing with the search box. Instead the UI offers it as a "still
 * can't find it?" action after a cheap search has already come back thin, which
 * is the only case where its accuracy is worth a credit.
 *
 * `get_city_events` is deliberately NOT wired in even for deep search: its date
 * filters are ignored upstream, it is metro-wide with no radius, and it costs
 * 3 credits for ~10 rows. JamBase does that job better and cheaper.
 *
 * An artist query WITH a location is served by Spotify and filtered locally on
 * the coordinates every row carries — no second request. Bandsintown rows carry
 * no coordinates, so a deep search filters on city NAME instead.
 *
 * No source is complete, which is why manual entry still exists.
 */

/** One page of results. JamBase reports the true total, so this drives paging. */
const PER_PAGE = 40;

export interface EventHit {
  source: 'jambase' | 'ticketmaster' | 'spotify' | 'bandsintown';
  /** Provider-scoped id; the add action needs `source` to know how to resolve it. */
  id: string;
  name: string;
  artist: string | null;
  startsAt: string | null;
  timezone: string | null;
  image: string | null;
  venue: string | null;
  city: string | null;
  region: string | null;
  isFestival: boolean;
}

function fromJamBase(e: jambase.JBEvent, searched?: string): EventHit | null {
  const id = jambase.jbId(e.identifier);
  if (!id) return null;
  const addr = e.location?.address ?? {};
  const head = jambase.headlinerOf(e, searched);

  return {
    source: 'jambase',
    id,
    name: e.name ?? 'Untitled',
    artist: head?.name ?? null,
    startsAt: jambase.resolveStart(e),
    timezone: addr['x-timezone'] ?? null,
    image: e.image || null,
    venue: e.location?.name ?? null,
    city: addr.addressLocality ?? null,
    region: addr.addressRegion?.alternateName ?? null,
    isFestival: jambase.isFestival(e),
  };
}

function fromSpotify(c: spotifyconcerts.SpotifyConcert, searched?: string): EventHit {
  return {
    source: 'spotify',
    id: c.id,
    name: c.title,
    artist: spotifyconcerts.headlinerOf(c, searched),
    startsAt: c.startsAt,
    // No IANA zone in the payload — only a UTC offset, which cannot be turned
    // into one. Rendering falls back to the viewer's zone.
    timezone: null,
    image: null,
    venue: c.venueName,
    city: c.city,
    region: c.region,
    isFestival: c.isFestival,
  };
}

/**
 * No coordinates and no IANA zone on a Bandsintown list row — only a naive local
 * wall time. `startsAt` is therefore anchored at UTC for display, which the card
 * renders in the viewer's zone, exactly as the Spotify path already does. The
 * true zone arrives later via `enrichEventDetails` if the user saves the show.
 */
function fromBandsintown(e: bandsintown.BITEvent): EventHit {
  return {
    source: 'bandsintown',
    id: e.id,
    name: e.name,
    artist: e.artistName,
    startsAt: `${e.startsAtLocal.replace(/Z$/, '')}Z`,
    timezone: null,
    image: null,
    venue: e.venueName,
    city: e.city,
    region: null,
    isFestival: false,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const keyword = searchParams.get('q') ?? searchParams.get('artist') ?? undefined;
  const attractionId = searchParams.get('attractionId') ?? undefined;
  const radius = searchParams.get('radius') ? Number(searchParams.get('radius')) : 50;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

  let lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : undefined;
  let lng = searchParams.get('lng') ? Number(searchParams.get('lng')) : undefined;

  /**
   * A named place ("shows in San Francisco") is an alternative to browser
   * geolocation, not an addition to it: explicit coordinates always win, so
   * "near me" is never silently overridden by a stale place name in the box.
   */
  const place = searchParams.get('place')?.trim() || undefined;
  let resolvedPlace: string | null = null;
  if (place && !(Number.isFinite(lat) && Number.isFinite(lng))) {
    const hit = await geocodePlace(place);
    if (!hit) {
      return NextResponse.json(
        { error: `Couldn't find a place called "${place}"`, events: [], source: null },
        { status: 404 },
      );
    }
    lat = hit.lat;
    lng = hit.lng;
    resolvedPlace = hit.label;
  }

  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
  if (!keyword && !attractionId && !hasGeo) {
    return NextResponse.json({ events: [], source: null });
  }

  // Ticketmaster attraction drill-down keeps using Ticketmaster: the id is
  // theirs, and this path is reached from a Ticketmaster artist result.
  if (attractionId) {
    try {
      const events = await getAttractionEvents(attractionId);
      return NextResponse.json({
        source: 'ticketmaster',
        events: events.map((e) => ({
          source: 'ticketmaster' as const,
          id: e.id,
          name: e.name,
          artist: e._embedded?.attractions?.[0]?.name ?? null,
          startsAt: e.dates?.start?.dateTime ?? e.dates?.start?.localDate ?? null,
          timezone: e.dates?.timezone ?? null,
          image: pickImage(e.images, 400),
          venue: e._embedded?.venues?.[0]?.name ?? null,
          city: e._embedded?.venues?.[0]?.city?.name ?? null,
          region: e._embedded?.venues?.[0]?.state?.stateCode ?? null,
          isFestival: false,
        })),
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'search failed' },
        { status: 502 },
      );
    }
  }

  /**
   * Deep search — Bandsintown, opt-in, one credit.
   *
   * Runs BEFORE the cheap providers rather than after, and that is not a
   * contradiction of the cost-ordered cascade in `ingest/match.ts`. The two are
   * answering different questions. There, the cascade is automatic and the goal
   * is to avoid spending; here the user has already been shown a cheap result,
   * judged it wrong or thin, and explicitly asked for the accurate source. Going
   * back through Spotify and JamBase first would just re-serve the answer they
   * already rejected.
   *
   * A miss still falls through, so a deep search that finds nothing degrades to
   * ordinary results rather than an empty page.
   */
  const deep = searchParams.get('deep') === '1';
  if (deep && keyword && bandsintown.isConfigured()) {
    // Attributed to the caller, so one person cannot spend the whole friend
    // group's monthly allowance. A cache hit bypasses the limit — nothing is
    // spent, so nothing is charged.
    const result = await deepSearchForUser(user.id, keyword);

    if (result?.artist && result.events.length > 0) {
      // City-name matching, not a radius — Bandsintown rows carry no
      // coordinates. `resolvedPlace` is a geocoder label like "San Francisco,
      // California, United States", so the leading component is the city.
      const cityHint = resolvedPlace?.split(',')[0]?.trim() || place;
      const inRange = cityHint
        ? bandsintown.nearCity(result.events, cityHint)
        : result.events;

      if (inRange.length > 0) {
        return NextResponse.json({
          source: 'bandsintown',
          place: resolvedPlace,
          artist: result.artist.name,
          total: inRange.length,
          page: 1,
          perPage: inRange.length,
          // The whole tour arrives in one response; there is nothing to page.
          hasMore: false,
          deep: true,
          events: inRange.map(fromBandsintown),
        });
      }
    }
  }

  /**
   * Artist queries go to Spotify first.
   *
   * Cached for 6 hours rather than the 5 minutes the JamBase path uses: the
   * free plan is 1000 requests a MONTH, so the cache here is a budget control.
   * Falling through to JamBase is the correct behaviour for an unconfigured
   * key, an exhausted quota, or an artist Spotify does not recognise.
   */
  if (keyword && spotifyconcerts.isConfigured()) {
    const result = await cachedArtistConcerts(keyword);

    if (result?.artist && result.concerts.length > 0) {
      const inRange =
        hasGeo && lat !== undefined && lng !== undefined
          ? spotifyconcerts.withinRadius(result.concerts, lat, lng, radius)
          : result.concerts;

      // An artist with tour dates but none near the requested city is a real
      // answer, not a failure — but it is a useless one, so let JamBase try
      // rather than showing an empty list.
      if (inRange.length > 0) {
        return NextResponse.json({
          source: 'spotify',
          place: resolvedPlace,
          artist: result.artist.name,
          total: inRange.length,
          page: 1,
          perPage: inRange.length,
          // The whole tour arrives in one response; there is nothing to page.
          hasMore: false,
          events: inRange.map((c) => fromSpotify(c, keyword)),
        });
      }
    }
  }

  // Location queries, and anything Spotify could not answer.
  if (jambase.isConfigured()) {
    // Cached across users: "what's on near me" is the same upstream query for
    // everyone in a city, and JamBase is a metered trial.
    const key = searchCacheKey({ provider: 'jambase', q: keyword, lat, lng, radius, page });
    const cached = await readSearchCache<Record<string, unknown>>(key);
    if (cached) return NextResponse.json({ ...cached, cached: true });

    try {
      const { events, total } = await jambase.searchEvents({
        artistName: keyword,
        lat: hasGeo ? lat : undefined,
        lng: hasGeo ? lng : undefined,
        radiusMiles: radius,
        startDate: new Date().toISOString().slice(0, 10),
        page,
        perPage: PER_PAGE,
      });

      const payload = {
        source: 'jambase',
        // Echoed so the UI can confirm what "San Francisco" resolved to.
        place: resolvedPlace,
        total,
        page,
        perPage: PER_PAGE,
        hasMore: page * PER_PAGE < total,
        events: events.map((e) => fromJamBase(e, keyword)).filter(Boolean),
      };

      await writeSearchCache(key, payload, 300);
      return NextResponse.json(payload);
    } catch (err) {
      console.error('JamBase search failed, falling back to Ticketmaster', err);
    }
  }

  try {
    const events = await tmSearchEvents({
      keyword,
      latlong: hasGeo ? `${lat},${lng}` : undefined,
      radius: hasGeo ? radius : undefined,
      startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      size: 40,
    });

    return NextResponse.json({
      source: 'ticketmaster',
      place: resolvedPlace,
      events: events.map((e) => ({
        source: 'ticketmaster' as const,
        id: e.id,
        name: e.name,
        artist: e._embedded?.attractions?.[0]?.name ?? null,
        startsAt: e.dates?.start?.dateTime ?? e.dates?.start?.localDate ?? null,
        timezone: e.dates?.timezone ?? null,
        image: pickImage(e.images, 400),
        venue: e._embedded?.venues?.[0]?.name ?? null,
        city: e._embedded?.venues?.[0]?.city?.name ?? null,
        region: e._embedded?.venues?.[0]?.state?.stateCode ?? null,
        isFestival: false,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'search failed' },
      { status: 502 },
    );
  }
}
