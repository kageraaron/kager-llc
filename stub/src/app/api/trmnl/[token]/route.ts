import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTrmnlPayload, type TrmnlSourceRow } from '@/lib/trmnl';

/**
 * Polled feed for the TRMNL display plugin: GET …/api/trmnl/<token>
 *
 * TRMNL's servers fetch this on the playlist's refresh schedule and pass the
 * body to the plugin's Liquid template. The request carries no Stub session, so
 * the token IS the credential — the same arrangement as the calendar feed, and
 * with the same obligation: the lookup runs with the service role, so every
 * query below must be scoped by the resolved user id and nothing else.
 *
 * Narrower than the calendar feed on purpose. That one exports `went` too,
 * because a calendar is a record; this is a "what's next" panel, so it carries
 * only future `going`/`interested` shows, and no notes, prices or ticket refs —
 * a wall display is read by whoever walks past it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Cheap shape check before touching the database.
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('trmnl_token', token)
    .maybeSingle();

  if (!profile) return new NextResponse('Not found', { status: 404 });

  const { data, error } = await admin
    .from('attendances')
    .select(`
      state,
      event:events!inner (
        name, starts_at, timezone,
        venue:venues ( name, city, region, country, timezone ),
        headliner:artists!events_headliner_id_fkey ( name )
      )
    `)
    .eq('user_id', profile.id)
    .in('state', ['going', 'interested'])
    .gte('events.starts_at', new Date().toISOString());

  if (error) return new NextResponse('Error', { status: 500 });

  /*
   * Sorted here rather than in the query for the reason `queries.ts` documents
   * at length: PostgREST's `order(..., { referencedTable })` sorts within an
   * embedded resource, so ordering a list of attendances by their event's date
   * is a silent no-op. The payload builder drops from the tail to fit the 2KB
   * budget, which makes this ordering load-bearing — unsorted, truncation would
   * discard an arbitrary set of shows rather than the furthest-out ones.
   */
  const rows = ((data ?? []) as unknown as TrmnlSourceRow[]).sort(
    (a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime(),
  );

  return NextResponse.json(buildTrmnlPayload(rows), {
    headers: {
      /*
       * No caching. TRMNL's own refresh interval is already the rate limiter —
       * it polls minutes apart at most — so a CDN cache buys nothing and risks
       * the one failure a wall display makes obvious: a show that has already
       * happened still sitting at the top of the panel.
       */
      'Cache-Control': 'no-store',
    },
  });
}
