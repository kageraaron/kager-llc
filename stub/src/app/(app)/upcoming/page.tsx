import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getUpcoming, getFriendsAtEvent } from '@/lib/queries';
import { EventCard } from '@/components/EventCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UpcomingPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const rows = await getUpcoming(supabase, user!.id);

  // Friends-per-event for the avatar stacks. One query per event is fine at the
  // scale this app runs at (a personal calendar, not a feed).
  const friendsByEvent = new Map<string, Awaited<ReturnType<typeof getFriendsAtEvent>>>();
  await Promise.all(
    rows.map(async (r) => {
      friendsByEvent.set(r.event.id, await getFriendsAtEvent(supabase, r.event.id, user!.id));
    }),
  );

  return (
    <main className="page">
      <header className="page-header">
        <h1>Upcoming</h1>
        <div className="sub">
          {rows.length === 0 ? 'Nothing on the calendar' : `${rows.length} show${rows.length === 1 ? '' : 's'} ahead`}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No shows yet</h2>
          <p>
            Connect Gmail and Stub will find ticket confirmations on its own.
            Or add a show by hand from Browse.
          </p>
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            <Link className="btn btn-primary btn-block" href="/settings/connections">Connect Gmail</Link>
            <Link className="btn btn-block" href="/browse">Find a show</Link>
          </div>
        </div>
      ) : (
        rows.map((row) => (
          <EventCard
            key={row.id}
            event={row.event}
            friends={friendsByEvent.get(row.event.id)?.map((f) => f.profile)}
            badge={
              row.source !== 'manual'
                ? { label: row.source === 'gmail' ? 'From Gmail' : 'Imported', tone: 'going' }
                : undefined
            }
          />
        ))
      )}
    </main>
  );
}
