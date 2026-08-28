import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchEvents, getAttractionEvents, pickImage } from '@/lib/providers/ticketmaster';

/** Event search for the Browse tab. Signed-in only, so our API quota isn't public. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const keyword = searchParams.get('q') ?? undefined;
  const city = searchParams.get('city') ?? undefined;
  const attractionId = searchParams.get('attractionId') ?? undefined;

  if (!keyword && !city && !attractionId) {
    return NextResponse.json({ events: [] });
  }

  try {
    const events = attractionId
      ? await getAttractionEvents(attractionId)
      : await searchEvents({
          keyword,
          city,
          startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          size: 40,
        });

    return NextResponse.json({
      events: events.map((e) => ({
        tmId: e.id,
        name: e.name,
        startsAt: e.dates?.start?.dateTime ?? e.dates?.start?.localDate ?? null,
        timezone: e.dates?.timezone ?? null,
        image: pickImage(e.images, 400),
        artist: e._embedded?.attractions?.[0]?.name ?? null,
        venue: e._embedded?.venues?.[0]?.name ?? null,
        city: e._embedded?.venues?.[0]?.city?.name ?? null,
        region: e._embedded?.venues?.[0]?.state?.stateCode ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'search failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
