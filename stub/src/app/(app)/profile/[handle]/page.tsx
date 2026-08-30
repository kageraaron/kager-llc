import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { EventCard } from '@/components/EventCard';
import { ProfileEditor } from '@/components/ProfileEditor';
import type { EventRow } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, display_name, bio, avatar_url, home_city')
    .eq('handle', handle.toLowerCase())
    .maybeSingle();

  if (!profile) notFound();
  const isMe = profile.id === user!.id;

  // RLS decides what comes back: own rows always, friends' rows only when the
  // friendship is accepted and the attendance is marked visible to friends.
  const { data: attendances } = await supabase
    .from('attendances')
    .select(`
      id, state,
      event:events!inner (
        id, tm_id, name, starts_at, timezone, image_url, url, status,
        venue:venues ( id, name, city, region, country, timezone ),
        headliner:artists!events_headliner_id_fkey ( id, name, image_url )
      )
    `)
    .eq('user_id', profile.id)
    // No .order() on the embedded table here: it sorts within the embed, not the
    // top-level rows. Sorted below instead. See the note in lib/queries.ts.
    .limit(40);

  const rows = ((attendances ?? []) as unknown as { id: string; state: string; event: EventRow }[])
    .sort((a, b) => new Date(b.event.starts_at).getTime() - new Date(a.event.starts_at).getTime());
  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.event.starts_at).getTime() >= now).reverse();
  const past = rows.filter((r) => new Date(r.event.starts_at).getTime() < now);

  return (
    <main className="page">
      <header className="page-header">
        <h1>{profile.display_name || profile.handle}</h1>
        <div className="sub">@{profile.handle}{profile.home_city ? ` · ${profile.home_city}` : ''}</div>
      </header>

      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar" style={{ width: 68, height: 68 }} src={profile.avatar_url} alt="" />
        ) : (
          <div className="avatar" style={{ width: 68, height: 68 }} />
        )}
        {profile.bio && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{profile.bio}</p>}
      </div>

      {isMe && <ProfileEditor profile={profile} />}

      {upcoming.length > 0 && (
        <section>
          <div className="section-label">Going to</div>
          {upcoming.map((r) => <EventCard key={r.id} event={r.event} />)}
        </section>
      )}

      <section>
        <div className="section-label">
          {past.length > 0 ? `${past.length} show${past.length === 1 ? '' : 's'} seen` : 'History'}
        </div>
        {past.length === 0 ? (
          <p className="muted">
            {isMe ? 'Nothing here yet.' : 'Nothing shared with you yet.'}
          </p>
        ) : (
          past.map((r) => <EventCard key={r.id} event={r.event} />)
        )}
      </section>
    </main>
  );
}
