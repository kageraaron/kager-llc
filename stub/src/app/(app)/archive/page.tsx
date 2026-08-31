import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getArchive, getSetlistFlags } from '@/lib/queries';
import { yearOf, summarizeYear } from '@/lib/yearInReview';
import { EventCard } from '@/components/EventCard';
import { QuickRate } from '@/components/QuickRate';
import { AddShowButton } from '@/components/AddShow';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * How recently a show has to have happened for the Archive to ask about it.
 *
 * Long enough to catch a weekend you have not opened the app since, short
 * enough that the prompt does not become permanent furniture on every unrated
 * row in a ten-year history — an ask that never goes away stops being an ask.
 */
const RATE_PROMPT_DAYS = 200;

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

  const years = [...byYear.keys()];

  /*
   * A live summary of the current year, at the top rather than behind a link.
   *
   * `summarizeYear` is a pure function over rows this page has already fetched,
   * so this costs arithmetic and no queries. The point is that accumulation is
   * the honest retention mechanic for a concert diary — you cannot go to more
   * shows by trying harder, so a streak would be an insult, but a count that
   * grows is a real reward for logging.
   */
  const thisYear = new Date().getFullYear();
  const currentRows = byYear.get(String(thisYear));
  const stats = currentRows ? summarizeYear(rows, thisYear) : null;

  const rateCutoff = Date.now() - RATE_PROMPT_DAYS * 86_400_000;

  return (
    <main className="page">
      <header className="page-header">
        <div className="head-row">
          <div>
            <h1>Archive</h1>
            <div className="sub">
              {rows.length === 0 ? 'No past shows yet' : `${rows.length} show${rows.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <AddShowButton />
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>Your history is empty</h2>
          <p>
            Shows move here automatically once the date passes. You can also add
            one you already saw, or import everything you have logged on setlist.fm.
          </p>
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            <AddShowButton className="btn btn-primary btn-block" label="Add a past show" />
            <Link className="btn btn-block" href="/settings/connections">
              Import from setlist.fm
            </Link>
          </div>
        </div>
      ) : (
        <>
          {stats && (
            <Link href={`/year/${thisYear}`} className="stat-strip">
              <div>
                <div className="n">{stats.shows}</div>
                <div className="l">Shows</div>
              </div>
              <div>
                <div className="n">{stats.artists}</div>
                <div className="l">Artists</div>
              </div>
              <div>
                <div className="n">{stats.cities}</div>
                <div className="l">Cities</div>
              </div>
              <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                <span className="pill">{thisYear} in review &rarr;</span>
              </div>
            </Link>
          )}

          {/* Only worth the row when there is more than one year to jump between. */}
          {years.length > 1 && (
            <nav className="year-jump" aria-label="Jump to year">
              {years.map((y) => (
                <a key={y} href={`#year-${y}`}>{y}</a>
              ))}
            </nav>
          )}

          {years.map((year) => {
            const yearRows = byYear.get(year)!;
            return (
              <section key={year} id={`year-${year}`}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="section-label">{year} · {yearRows.length}</div>
                  <Link className="pill" href={`/year/${year}`}>Year in review &rarr;</Link>
                </div>
                {yearRows.map((row) => {
                  /*
                   * Ask about a show only while it is still fresh, and only once
                   * — an existing rating means the question is answered.
                   */
                  const askToRate =
                    row.rating == null &&
                    new Date(row.event.starts_at).getTime() > rateCutoff;

                  return (
                    <EventCard
                      key={row.id}
                      dense
                      event={row.event}
                      rating={row.rating}
                      hasSetlist={withSetlist.has(row.event.id)}
                      footer={askToRate ? <QuickRate eventId={row.event.id} /> : undefined}
                    />
                  );
                })}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
