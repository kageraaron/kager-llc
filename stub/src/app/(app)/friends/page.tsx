import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getFriendsPlans } from '@/lib/queries';
import { EventCard } from '@/components/EventCard';
import { AddFriend, FriendRequestRow } from '@/components/FriendControls';

export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const me = user!.id;

  const [{ data: friendships }, plans, { data: myProfile }] = await Promise.all([
    supabase
      .from('friendships')
      .select('user_low, user_high, status, requested_by, created_at')
      .or(`user_low.eq.${me},user_high.eq.${me}`),
    getFriendsPlans(supabase, me),
    supabase.from('profiles').select('handle').eq('id', me).single(),
  ]);

  const rows = friendships ?? [];
  const otherId = (r: { user_low: string; user_high: string }) =>
    r.user_low === me ? r.user_high : r.user_low;

  const accepted = rows.filter((r) => r.status === 'accepted');
  // Requests waiting on ME: pending, and someone else sent them.
  const incoming = rows.filter((r) => r.status === 'pending' && r.requested_by !== me);
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requested_by === me);

  const ids = [...new Set([...accepted, ...incoming, ...outgoing].map(otherId))];
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, handle, display_name, avatar_url').in('id', ids)
    : { data: [] };

  const profileOf = (id: string) => (profiles ?? []).find((p) => p.id === id);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Friends</h1>
        <div className="sub">
          {myProfile?.handle ? `You are @${myProfile.handle}` : 'Share your handle to connect'}
        </div>
      </header>

      <AddFriend />

      {incoming.length > 0 && (
        <section>
          <div className="section-label">Requests</div>
          {incoming.map((r) => {
            const p = profileOf(otherId(r));
            return p ? <FriendRequestRow key={p.id} profile={p} /> : null;
          })}
        </section>
      )}

      {plans.length > 0 && (
        <section>
          <div className="section-label">What your friends are going to</div>
          {plans.map(({ event, friends }) => (
            <EventCard key={event.id} event={event} friends={friends} />
          ))}
        </section>
      )}

      <section>
        <div className="section-label">
          {accepted.length} friend{accepted.length === 1 ? '' : 's'}
        </div>

        {accepted.length === 0 ? (
          <div className="empty">
            <h2>No friends yet</h2>
            <p>Add someone by their handle above. You will see the shows they are going to here.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {accepted.map((r) => {
              const p = profileOf(otherId(r));
              if (!p) return null;
              return (
                <Link key={p.id} href={`/profile/${p.handle}`} className="row">
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar" src={p.avatar_url} alt="" />
                  ) : (
                    <div className="avatar" />
                  )}
                  <div>
                    <div style={{ fontWeight: 550 }}>{p.display_name || p.handle}</div>
                    <div className="muted">@{p.handle}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <div className="section-label">Sent</div>
          {outgoing.map((r) => {
            const p = profileOf(otherId(r));
            return p ? (
              <div key={p.id} className="muted" style={{ padding: '6px 0' }}>
                @{p.handle} &middot; waiting
              </div>
            ) : null;
          })}
        </section>
      )}

      <div style={{ marginTop: 32 }}>
        <Link className="btn btn-block" href="/settings">Settings</Link>
      </div>
    </main>
  );
}
