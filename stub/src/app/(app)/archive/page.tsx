import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getArchive, getSetlistFlags } from '@/lib/queries';
import { yearOf } from '@/lib/yearInReview';
import { EventCard } from '@/components/EventCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const rows = await getArchive(supabase, user!.id);

  // One query for the whole page, and no setlist.fm traffic at all.
  const withSetlist = await getSetlistFlags(supabase, rows.map((r) => r.event.id));

  /*
   * Group by year so a long history stays scannable — in the VENUE's zone.
   *
   * `new Date(starts_at).getFullYear()` uses the RUNTIME's zone, which is UTC
   * on Vercel, so a 9pm New Year's Eve show in San Francisco
   * (`2026-01-01T04:00:00Z`) was filed under the following year. Same fault as
   * the 5 AM card, in a different place.
   */
  const byYear = new Map<string, typeof rows>();
  for (const row of rows) {
    const year = String(yearOf(row));
    byYear.set(year, [...(byYear.get(year) ?? []), row]);
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Archive</h1>
        <div className="sub">
          {rows.length === 0 ? 'No past shows yet' : `${rows.length} show${rows.length === 1 ? '' : 's'}`}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>Your history is empty</h2>
          <p>
            Shows move here automatically once the date passes.
            You can also import everything you have logged on setlist.fm.
          </p>
        </div>
      ) : (
        [...byYear.entries()].map(([year, yearRows]) => (
          <section key={year}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="section-label">{year} · {yearRows.length}</div>
              <Link className="muted" style={{ fontSize: 13 }} href={`/year/${year}`}>
                Year in review &rarr;
              </Link>
            </div>
            {yearRows.map((row) => (
              <EventCard
                key={row.id}
                event={row.event}
                rating={row.rating}
                hasSetlist={withSetlist.has(row.event.id)}
              />
            ))}
          </section>
        ))
      )}
    </main>
  );
}
