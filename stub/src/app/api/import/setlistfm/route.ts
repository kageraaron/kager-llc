import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllAttended, parseSetlistDate } from '@/lib/providers/setlistfm';
import { searchEvents } from '@/lib/providers/ticketmaster';
import { upsertEvent, recordAttendance } from '@/lib/ingest/catalog';

export const maxDuration = 60;

/**
 * Backfills the Archive from a setlist.fm account.
 *
 * setlist.fm is the best free record of shows a person actually ATTENDED -
 * Ticketmaster only knows what it sold. We still resolve each setlist to a
 * Ticketmaster event where possible so the archive shares one catalog with
 * everything else; when there is no match we create the event from the
 * setlist.fm data directly rather than dropping it.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { username } = (await request.json()) as { username?: string };
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  let setlists;
  try {
    setlists = await getAllAttended(username);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'setlist.fm request failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const admin = createAdminClient();
  let imported = 0;
  let skipped = 0;

  for (const sl of setlists) {
    const date = parseSetlistDate(sl.eventDate);
    if (!date) { skipped++; continue; }

    try {
      // Try to reconcile with Ticketmaster so the archive and upcoming tabs
      // reference the same event rows.
      const candidates = await searchEvents({
        keyword: sl.artist.name,
        startDateTime: `${date}T00:00:00Z`,
        endDateTime: `${date}T23:59:59Z`,
        size: 5,
      });

      let eventId: string | null = null;

      if (candidates.length > 0) {
        eventId = await upsertEvent(admin, candidates[0]);
      } else {
        // No Ticketmaster record - create the event from setlist.fm directly.
        const { data: artist } = await admin
          .from('artists')
          .upsert({ mbid: sl.artist.mbid, name: sl.artist.name }, { onConflict: 'mbid' })
          .select('id')
          .single();

        // Conflict on setlistfm_id, not tm_id: these venues have no
        // Ticketmaster id, and NULLs never collide in a unique index, so
        // upserting on tm_id would insert a duplicate on every import.
        const { data: venue } = await admin
          .from('venues')
          .upsert(
            {
              setlistfm_id: sl.venue.id,
              name: sl.venue.name,
              city: sl.venue.city?.name ?? null,
              region: sl.venue.city?.stateCode ?? sl.venue.city?.state ?? null,
              country: sl.venue.city?.country?.code ?? null,
              lat: sl.venue.city?.coords?.lat ?? null,
              lng: sl.venue.city?.coords?.long ?? null,
            },
            { onConflict: 'setlistfm_id' },
          )
          .select('id')
          .single();

        const { data: created } = await admin
          .from('events')
          .upsert(
            {
              setlistfm_id: sl.id,
              name: sl.artist.name,
              headliner_id: artist?.id ?? null,
              venue_id: venue?.id ?? null,
              starts_at: `${date}T20:00:00Z`,
              status: 'completed',
              url: sl.url ?? null,
            },
            { onConflict: 'setlistfm_id' },
          )
          .select('id')
          .single();

        eventId = created?.id ?? null;
      }

      if (!eventId) { skipped++; continue; }

      await recordAttendance(admin, { userId: user.id, eventId, source: 'setlistfm' });
      // Past shows import as attended, not as "going".
      await admin
        .from('attendances')
        .update({ state: 'went' })
        .eq('user_id', user.id)
        .eq('event_id', eventId);

      imported++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, total: setlists.length, imported, skipped });
}
