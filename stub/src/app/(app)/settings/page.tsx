import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { SignOutButton } from '@/components/SignOutButton';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { PushToggle } from '@/components/PushToggle';
import { CalendarSubscribe } from '@/components/CalendarSubscribe';
import { TrmnlConnect } from '@/components/TrmnlConnect';
import { InviteLink } from '@/components/InviteLink';
import { HouseholdName } from '@/components/HouseholdName';
import { ProfileEditor } from '@/components/ProfileEditor';
import { getHouseholdId, getHouseholdMembers } from '@/lib/household';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const householdId = await getHouseholdId(supabase, user!.id);
  const [{ data: household }, members, { data: profile }] = await Promise.all([
    supabase.from('households').select('name').eq('id', householdId).single(),
    getHouseholdMembers(supabase, householdId),
    supabase
      .from('profiles')
      .select('id, handle, display_name, bio, avatar_url, home_city')
      .eq('id', user!.id)
      .single(),
  ]);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <div className="sub">{user?.email}</div>
      </header>

      <section>
        <div className="section-label">Household</div>
        <div className="panel">
          <HouseholdName initial={household?.name ?? 'Home'} />
          <div className="stack">
            {members.map((m) => (
              <div key={m.user_id} className="row">
                {m.profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar" src={m.profile.avatar_url} alt="" />
                ) : (
                  <div className="avatar" />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 550 }}>
                    {m.profile?.display_name || m.profile?.handle || 'Member'}
                    {m.user_id === user!.id && <span className="muted"> (you)</span>}
                  </div>
                  <div className="fine">Admin</div>
                </div>
              </div>
            ))}
          </div>
          <InviteLink />
        </div>
      </section>

      <section>
        <div className="section-label">Your profile</div>
        {profile && <ProfileEditor profile={profile} />}
      </section>

      <section>
        <div className="section-label">Reminders and calendars</div>
        <PushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
        <CalendarSubscribe />
        <TrmnlConnect />
      </section>

      <section>
        <div className="section-label">Account</div>
        <div className="stack">
          <Link className="btn btn-block" href="/settings/connections">Connections</Link>
          <SignOutButton />
        </div>
        <p className="fine mt-6">
          Everything in Stub — shows, notes, ratings and the Inbox — is shared with the
          people in your household, and no one else. Connected mailboxes are read for ticket
          confirmations only, and message bodies are never stored. You can delete your
          account at any time, below.
        </p>
        <DeleteAccountButton />
      </section>
    </main>
  );
}
