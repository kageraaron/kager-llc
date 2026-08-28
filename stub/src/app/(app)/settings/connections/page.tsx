import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { GOOGLE_TESTING_USER_CAP } from '@/lib/providers/gmail';
import { SPOTIFY_DEV_USER_CAP } from '@/lib/providers/spotify';
import { SetlistImport } from '@/components/SetlistImport';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('id, provider, email, last_synced_at, status')
    .eq('user_id', user!.id);

  const gmail = (accounts ?? []).find((a) => a.provider === 'gmail');
  const forwardEnabled = process.env.FEATURE_FORWARD_INBOX === 'true';

  return (
    <main className="page">
      <header className="page-header">
        <Link href="/friends" className="muted" style={{ fontSize: 14 }}>&larr; Settings</Link>
        <h1 style={{ marginTop: 8 }}>Connections</h1>
      </header>

      {params.error && <p className="error">Could not connect: {params.error}</p>}
      {params.connected && <p className="muted">Gmail connected. First scan runs within 30 minutes.</p>}

      {/* ---------------------------------------------------- Gmail */}
      <section>
        <div className="section-label">Ticket sources</div>

        <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
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
              <a className="btn btn-block" href="/api/connect/gmail/start">Reconnect</a>
            </>
          ) : (
            <a className="btn btn-primary btn-block" href="/api/connect/gmail/start">Connect Gmail</a>
          )}
        </div>

        {/* ---------------------------------------------------- forward address */}
        <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
          <div className="spread">
            <strong>Forwarding address</strong>
            <span className="pill">{forwardEnabled ? 'Available' : 'Not set up'}</span>
          </div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            {forwardEnabled
              ? 'Forward any ticket confirmation to your private Stub address and it will be added.'
              : 'Works with any mail provider, no account access needed. Requires a domain on Cloudflare — see workers/email-router/README.md to switch it on.'}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------- imports */}
      <section>
        <div className="section-label">Import your history</div>
        <SetlistImport />

        <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
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

        <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
          <div className="spread">
            <strong>Apple Music</strong>
            <span className="pill">Unavailable</span>
          </div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Apple Music import and Sign in with Apple both require a paid Apple Developer
            Program membership. Not enabled on this build.
          </p>
        </div>
      </section>

      <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 24 }}>
        Stub runs with Google OAuth in testing mode, which supports up to{' '}
        {GOOGLE_TESTING_USER_CAP} approved accounts. Your Google account must be on the
        test-user list before Gmail can be connected.
      </p>
    </main>
  );
}
