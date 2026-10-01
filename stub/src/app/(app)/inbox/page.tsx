import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { CandidateCard } from '@/components/CandidateCard';
import { SkippedMessages, UnreadTickets, type SkippedMessage } from '@/components/SkippedMessages';
import { looksLikeTicketMail, nameFromSubject } from '@/lib/ingest/extractors/loose';
import { getHouseholdId } from '@/lib/household';

export const dynamic = 'force-dynamic';

/**
 * The review queue. Anything the matcher could not place with high confidence
 * lands here rather than being silently added or silently dropped - the same
 * bargain Shop makes when it cannot read a tracking email.
 */
export default async function InboxPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  // One shared queue: candidates from either person's Gmail land here.
  const householdId = await getHouseholdId(supabase, user!.id);

  const { data: candidates } = await supabase
    .from('ingest_candidates')
    .select(`
      id, parsed, confidence, matched_event_id,
      message:ingest_messages ( subject, from_addr ),
      event:events ( id, name, starts_at, timezone, image_url, venue:venues ( name, city, region, country, timezone ) )
    `)
    .eq('household_id', householdId)
    .eq('state', 'pending')
    .order('created_at', { ascending: false });

  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('id, provider, email, last_synced_at');

  /**
   * Messages that were read but yielded nothing. Capped, because a 30-day scan
   * of a real inbox turns up a lot of marketing — the point is to make a missed
   * confirmation *findable*, not to render the whole mailbox.
   */
  const { data: skipped } = await supabase
    .from('ingest_messages')
    .select('id, subject, from_addr, received_at, status, error')
    .eq('household_id', householdId)
    .in('status', ['ignored', 'error'])
    // Older rows have had their sender and subject erased (lib/retention.ts).
    .not('subject', 'is', null)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(50);

  const rows = (candidates ?? []) as unknown as React.ComponentProps<typeof CandidateCard>['candidate'][];
  const allSkipped = (skipped ?? []) as SkippedMessage[];
  // A seller's confirmation nothing could read is a miss, not noise: show it.
  const isUnread = (m: SkippedMessage) =>
    m.status === 'ignored' && !!m.subject && looksLikeTicketMail({ from: m.from_addr ?? '', subject: m.subject });
  const unread = allSkipped.filter(isUnread).map((m) => ({ ...m, name: nameFromSubject(m.subject ?? '') }));
  const skippedRows = allSkipped.filter((m) => !isUnread(m));

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
              {skippedRows.length > 0 && ' Everything it read but couldn’t parse is listed below.'}
            </p>
          ) : (
            <>
              <p>
                Connect Gmail and Stub will scan the last 30 days for ticket confirmations,
                then keep watching for new ones.
              </p>
              <Link
                className="btn btn-primary"
                style={{ marginTop: 16 }}
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

      <UnreadTickets messages={unread} />
      <SkippedMessages messages={skippedRows} />
    </main>
  );
}
