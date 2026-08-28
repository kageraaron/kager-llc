import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { searchEvents as tmSearchEvents, getAttractionEvents, pickImage } from '@/lib/providers/ticketmaster';
import * as jambase from '@/lib/providers/jambase';

/**
 * Event search for Browse.
 *
 * JamBase is preferred when configured: Ticketmaster only lists events it sells
 * tickets to, so it misses the club circuit and — the case that drove this —
 * festival appearances. "Overmono in San Francisco" returns nothing from
 * Ticketmaster because the SF date is a Portola set; JamBase returns it.
 *
 * Falls back to Ticketmaster whenever JamBase is unconfigured or errors, so a
 * lapsed JamBase trial degrades the results rather than breaking the page.
 */

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
    try {
      const { events, total } = await jambase.searchEvents({
        artistName: keyword,
        lat: hasGeo ? lat : undefined,
        lng: hasGeo ? lng : undefined,
        radiusMiles: radius,
        startDate: new Date().toISOString().slice(0, 10),
        perPage: 40,
      });

      return NextResponse.json({
        source: 'jambase',
        total,
        events: events.map((e) => fromJamBase(e, keyword)).filter(Boolean),
      });
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
