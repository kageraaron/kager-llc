import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildIcs, type IcsEvent } from '@/lib/ics';

/**
 * Subscribable calendar feed: webcal://…/api/calendar/<token>
 *
 * No session — calendar clients can't hold one — so the token IS the
 * credential. It's looked up with the service role, which is why this route
 * must scope every query by the resolved user id and nothing else.
 *
 * Private notes are NOT included: a feed URL can be pasted into shared
 * calendars, and notes are owner-only by design.
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
    .select('id, display_name, handle')
    .eq('calendar_token', token)
    .maybeSingle();

  if (!profile) return new NextResponse('Not found', { status: 404 });

  const { data, error } = await admin
    .from('attendances')
    .select(`
      state,
      event:events!inner (
        id, name, starts_at, timezone, url,
        venue:venues ( name, city, region ),
        headliner:artists!events_headliner_id_fkey ( name )
      )
    `)
    .eq('user_id', profile.id)
    .in('state', ['going', 'interested', 'went']);

  if (error) return new NextResponse('Error', { status: 500 });

  type Row = {
    state: string;
    event: {
      id: string;
      name: string;
      starts_at: string;
      timezone: string | null;
      url: string | null;
      venue: { name: string; city: string | null; region: string | null } | null;
      headliner: { name: string } | null;
    };
  };

  const events: IcsEvent[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.event.id,
    title:
      (r.event.headliner?.name ?? r.event.name) +
      (r.state === 'interested' ? ' (interested)' : ''),
    startsAt: r.event.starts_at,
    timezone: r.event.timezone,
    venueName: r.event.venue?.name,
    city: r.event.venue?.city,
    region: r.event.venue?.region,
    url: r.event.url,
  }));

  const name = profile.display_name || profile.handle;
  const ics = buildIcs(events, { calendarName: `${name} — Shows` });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Subscribers poll on their own schedule; a short cache is plenty.
      'Cache-Control': 'public, max-age=900',
    },
  });
}
