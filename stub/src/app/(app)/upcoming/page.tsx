import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getUpcoming } from '@/lib/queries';
import { getHouseholdId } from '@/lib/household';
import { yearOf } from '@/lib/yearInReview';
import { EventCard } from '@/components/EventCard';
import Link from 'next/link';
import { AddShowButton } from '@/components/AddShow';

export const dynamic = 'force-dynamic';

export default async function UpcomingPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const householdId = await getHouseholdId(supabase, user!.id);
  const rows = await getUpcoming(supabase, householdId);

  // Only offer to connect Gmail if no inbox in the household is connected yet —
  // either person's feeds the same list. RLS returns the household's accounts.
  const { data: emailAccounts } = await supabase
    .from('email_accounts')
    .select('id, provider, status');
  const gmail = (emailAccounts ?? []).find((a) => a.provider === 'gmail');

  /*
   * Grouped in the VENUE's zone, not the server's. A 9pm New Year's Eve show in
   * San Francisco is stored as `2026-01-01T04:00:00Z`, so bucketing on the raw
   * instant files it under the wrong year — the same fault the Archive had.
   */
  const byYear: [number, typeof rows][] = [];
  for (const row of rows) {
    const year = yearOf(row);
    const last = byYear[byYear.length - 1];
    if (last && last[0] === year) last[1].push(row);
    else byYear.push([year, [row]]);
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="head-row">
          <div>
            <h1>Upcoming</h1>
            <div className="sub">
              {rows.length === 0 ? 'Nothing on the calendar' : `${rows.length} show${rows.length === 1 ? '' : 's'} ahead`}
            </div>
          </div>
          <AddShowButton />
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No shows yet</h2>
          {gmail ? (
            <p>
              Stub is watching {gmail.status === 'active' ? 'your inbox' : 'your inbox (reconnect needed)'} for
              ticket confirmations. Nothing found yet — add one by hand in the meantime.
            </p>
          ) : (
            <p>
              Connect Gmail and Stub will find ticket confirmations on its own.
              Or add one by hand.
            </p>
          )}
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            {!gmail && (
              <Link className="btn btn-primary btn-block" href="/settings/connections">Connect Gmail</Link>
            )}
            <AddShowButton className={`btn btn-block ${gmail ? 'btn-primary' : ''}`} label="Add a show" />
          </div>
        </div>
      ) : (
        byYear.map(([year, yearRows]) => (
          <section key={year}>
            {/*
              * Only when the list actually spans years. Upcoming is usually all
              * one year, and a lone "2026" header above every show is noise —
              * the divider earns its place exactly when a ticket for next year
              * would otherwise sit indistinguishably among this year's.
              */}
            {byYear.length > 1 && <div className="section-label">{year}</div>}
            {yearRows.map((row) => (
              <EventCard
                key={row.id}
                event={row.event}
                state={row.state}
                // Deliberately untoned. The attendance pill beside it is the one
                // worth the accent colour; two accented pills read as noise.
                badge={
                  row.source !== 'manual'
                    ? { label: row.source === 'gmail' ? 'From Gmail' : 'Imported' }
                    : undefined
                }
              />
            ))}
          </section>
        ))
      )}
    </main>
  );
}
