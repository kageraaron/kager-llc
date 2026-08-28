import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getEvent, getNote } from '@/lib/queries';
import { buildIcs, eventToIcs, icsFilename } from '@/lib/ics';

/** Single-event .ics download for "add to calendar". */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const event = await getEvent(supabase, id);
  if (!event) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // The owner's private note is included here on purpose: this file is being
  // handed to the user's own calendar, not published. The subscribable feed
  // deliberately does NOT include it.
  const note = await getNote(supabase, id, user.id);
  const ics = buildIcs([eventToIcs(event, { note: note?.body })]);

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsFilename(event.headliner?.name ?? event.name)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
