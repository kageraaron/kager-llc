import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { GOOGLE_TESTING_USER_CAP } from '@/lib/providers/gmail';
import { SPOTIFY_DEV_USER_CAP } from '@/lib/providers/spotify';
import { SetlistImport } from '@/components/SetlistImport';
import { GmailControls } from '@/components/GmailControls';
import { getHouseholdId, getHouseholdMembers } from '@/lib/household';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; artists?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  // RLS returns every mailbox in the household: both feed the shared Inbox.
  const [{ data: accounts }, members] = await Promise.all([
    supabase.from('email_accounts').select('id, user_id, provider, email, last_synced_at, status'),
    getHouseholdId(supabase, user!.id).then((id) => getHouseholdMembers(supabase, id)),
  ]);

  const gmailAccounts = (accounts ?? []).filter((a) => a.provider === 'gmail');
  const gmail = gmailAccounts.find((a) => a.user_id === user!.id);
  const othersGmail = gmailAccounts.filter((a) => a.user_id !== user!.id);
  const nameOf = (userId: string) => {
    const p = members.find((m) => m.user_id === userId)?.profile;
    return p?.display_name || p?.handle || 'Household member';
  };

  return (
    <main className="page">
      <header className="page-header">
        <Link href="/settings" className="muted btn-link" style={{ fontSize: 13 }}>&larr; Settings</Link>
        <h1 style={{ marginTop: 8 }}>Connections</h1>
      </header>

      {params.error && <p className="error">Could not connect: {params.error}</p>}
      {params.connected === 'spotify' ? (
        <p className="muted">
          Spotify imported: {params.artists ?? 0} artist{params.artists === '1' ? '' : 's'} added to your favourites.
        </p>
      ) : params.connected ? (
        <p className="muted">Gmail connected. Scan below to pull in recent tickets.</p>
      ) : null}

      {/* ---------------------------------------------------- Gmail */}
      <section>
        <div className="section-label">Ticket sources</div>

        <div className="panel">
          <div className="spread">
            <strong>Gmail</strong>
            {gmail ? (
              <span className={`pill ${gmail.status === 'active' ? 'pill-going' : 'pill-review'}`}>
                {gmail.status === 'active' ? 'Connected' : 'Needs reconnect'}
              </span>
            ) : (
              <span className="pill">Not connected</span>
            )}
          </div>

          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Stub scans the last 30 days for ticket confirmations, then watches for new ones.
            It reads only messages matching known ticket senders and subjects, stores just the
            extracted show details, and never keeps the emails themselves.
          </p>

          {gmail ? (
            <>
              <div className="muted">
                {gmail.email}
                {gmail.last_synced_at &&
                  ` · last checked ${new Date(gmail.last_synced_at).toLocaleString()}`}
              </div>
              <GmailControls accountId={gmail.id} email={gmail.email} status={gmail.status} />
            </>
          ) : (
            <a className="btn btn-primary btn-block" href="/api/connect/gmail/start">Connect Gmail</a>
          )}
        </div>

        {othersGmail.map((a) => (
          <div key={a.id} className="panel">
            <div className="spread">
              <strong>{nameOf(a.user_id)}&rsquo;s Gmail</strong>
              <span className={`pill ${a.status === 'active' ? 'pill-going' : 'pill-review'}`}>
                {a.status === 'active' ? 'Connected' : 'Needs reconnect'}
              </span>
            </div>
            <div className="muted">
              {a.email}
              {a.last_synced_at && ` · last checked ${new Date(a.last_synced_at).toLocaleString()}`}
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Feeds the same Inbox as yours. Only {nameOf(a.user_id)} can scan or reconnect it.
            </p>
            <GmailControls accountId={a.id} email={a.email} status={a.status} own={false} />
          </div>
        ))}

      </section>

      {/* ---------------------------------------------------- imports */}
      <section>
        <div className="section-label">Import your history</div>
        <SetlistImport />

        <div className="panel">
          <div className="spread">
            <strong>Spotify</strong>
            <span className="pill">Limited</span>
          </div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Imports your followed and most-played artists. Spotify caps
            development-mode apps at {SPOTIFY_DEV_USER_CAP} connected accounts and requires the
            developer to hold Premium, so these slots are limited.
          </p>
          <a className="btn btn-block" href="/api/connect/spotify/start">Connect Spotify</a>
        </div>

      </section>

      <p className="fine mt-5">
        Stub runs with Google OAuth in testing mode, which supports up to{' '}
        {GOOGLE_TESTING_USER_CAP} approved accounts. Your Google account must be on the
        test-user list before Gmail can be connected.
      </p>
    </main>
  );
}
