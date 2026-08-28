import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { CandidateCard } from '@/components/CandidateCard';

export const dynamic = 'force-dynamic';

/**
 * The review queue. Anything the matcher could not place with high confidence
 * lands here rather than being silently added or silently dropped - the same
 * bargain Shop makes when it cannot read a tracking email.
 */
export default async function InboxPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  const { data: candidates } = await supabase
    .from('ingest_candidates')
    .select(`
      id, parsed, confidence, matched_event_id,
      message:ingest_messages ( subject, from_addr ),
      event:events ( id, name, starts_at, timezone, image_url, venue:venues ( name, city, region ) )
    `)
    .eq('user_id', user!.id)
    .eq('state', 'pending')
    .order('created_at', { ascending: false });

  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('id, provider, email, last_synced_at')
    .eq('user_id', user!.id);

  const rows = (candidates ?? []) as unknown as React.ComponentProps<typeof CandidateCard>['candidate'][];

  return (
    <main className="page">
      <header className="page-header">
        <h1>Inbox</h1>
        <div className="sub">
          {rows.length === 0 ? 'Nothing to review' : `${rows.length} to review`}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>All caught up</h2>
          {accounts && accounts.length > 0 ? (
            <p>
              Stub is watching {accounts.map((a) => a.email).join(', ')}. Confirmations it can read
              clearly go straight to Upcoming; anything ambiguous shows up here.
            </p>
          ) : (
            <>
              <p>
                Connect Gmail and Stub will scan the last 30 days for ticket confirmations,
                then keep watching for new ones.
              </p>
              <Link
                className="btn btn-primary"
                style={{ marginTop: 18 }}
                href="/settings/connections"
              >
                Connect Gmail
              </Link>
            </>
          )}
        </div>
      ) : (
        rows.map((c) => <CandidateCard key={c.id} candidate={c} />)
      )}
    </main>
  );
}
