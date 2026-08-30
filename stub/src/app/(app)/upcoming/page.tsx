import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getUpcoming, getFriendsAtEvents } from '@/lib/queries';
import { EventCard } from '@/components/EventCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UpcomingPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const rows = await getUpcoming(supabase, user!.id);

  // Only offer to connect Gmail if it isn't already connected — Settings and
  // Inbox both check this, and the empty state here used to prompt regardless.
  const { data: emailAccounts } = await supabase
    .from('email_accounts')
    .select('id, provider, status')
    .eq('user_id', user!.id);
  const gmail = (emailAccounts ?? []).find((a) => a.provider === 'gmail');

  // Friends-per-event for the avatar stacks, in one query rather than one per
  // row. RLS still decides what comes back; batching only changes the round trips.
  const friendsByEvent = await getFriendsAtEvents(
    supabase,
    rows.map((r) => r.event.id),
    user!.id,
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
          {gmail ? (
            <p>
              Stub is watching {gmail.status === 'active' ? 'your inbox' : 'your inbox (reconnect needed)'} for
              ticket confirmations. Nothing found yet — add a show from Browse in the meantime.
            </p>
          ) : (
            <p>
              Connect Gmail and Stub will find ticket confirmations on its own.
              Or add a show by hand from Browse.
            </p>
          )}
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            {!gmail && (
              <Link className="btn btn-primary btn-block" href="/settings/connections">Connect Gmail</Link>
            )}
            <Link className={`btn btn-block ${gmail ? 'btn-primary' : ''}`} href="/browse">Find a show</Link>
          </div>
        </div>
      ) : (
        rows.map((row) => (
          <EventCard
            key={row.id}
            event={row.event}
            state={row.state}
            friends={friendsByEvent.get(row.event.id)?.map((f) => f.profile)}
            // Deliberately untoned. The attendance pill beside it is the one
            // worth the accent colour; two accented pills in a row read as noise.
            badge={
              row.source !== 'manual'
                ? { label: row.source === 'gmail' ? 'From Gmail' : 'Imported' }
                : undefined
            }
          />
        ))
      )}
    </main>
  );
}
