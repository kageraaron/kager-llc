import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { searchEvents as tmSearchEvents, getAttractionEvents, pickImage } from '@/lib/providers/ticketmaster';
import * as jambase from '@/lib/providers/jambase';
import { searchCacheKey, readSearchCache, writeSearchCache } from '@/lib/cache';

/**
 * Event search for Browse. JamBase only.
 *
 * Ticketmaster is no longer queried: it only lists events it sells tickets to,
 * so it misses the club circuit and festival appearances. JamBase already
 * carries the Ticketmaster purchase link in its `offers` array when one exists,
 * so nothing is lost by dropping it as a search source.
 *
 * Ticketmaster remains as an emergency fallback ONLY when JamBase is
 * unconfigured — e.g. the trial has lapsed and no key is set — so Browse
 * degrades rather than going blank.
 *
 * NEITHER source is complete. An AXS-sold club show (Overmono DJ Set + Ben UFO,
 * SF, Sept 2026) is absent from both. That is why manual entry exists.
 */

/** One page of results. JamBase reports the true total, so this drives paging. */
const PER_PAGE = 40;

export interface EventHit {
  source: 'jambase' | 'ticketmaster';
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

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const keyword = searchParams.get('q') ?? searchParams.get('artist') ?? undefined;
  const attractionId = searchParams.get('attractionId') ?? undefined;
  const lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : undefined;
  const lng = searchParams.get('lng') ? Number(searchParams.get('lng')) : undefined;
  const radius = searchParams.get('radius') ? Number(searchParams.get('radius')) : 50;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

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

  // Preferred path: JamBase, which supports artist and/or location.
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
