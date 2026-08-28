import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { SignOutButton } from '@/components/SignOutButton';
import { PushToggle } from '@/components/PushToggle';
import { CalendarSubscribe } from '@/components/CalendarSubscribe';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const { data: profile } = await supabase
    .from('profiles')
    .select('handle, display_name')
    .eq('id', user!.id)
    .single();

  return (
    <main className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <div className="sub">{user?.email}</div>
      </header>

      <PushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      <CalendarSubscribe />

      <div className="stack">
        {profile?.handle && (
          <Link className="btn btn-block" href={`/profile/${profile.handle}`}>Your profile</Link>
        )}
        <Link className="btn btn-block" href="/settings/connections">Connections</Link>
        <SignOutButton />
      </div>

      <p className="muted" style={{ fontSize: 11, marginTop: 32, lineHeight: 1.6 }}>
        Stub keeps your notes private to you — they are never shared with friends, at any
        visibility setting. Connected mailboxes are read for ticket confirmations only, and
        message bodies are never stored.
      </p>
    </main>
  );
}
