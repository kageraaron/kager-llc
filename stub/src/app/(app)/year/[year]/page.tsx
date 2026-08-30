import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getArchive, type AttendanceWithEvent } from '@/lib/queries';
import { summarizeYear, yearsWithShows } from '@/lib/yearInReview';
import { displayEventName, formatEventDate, formatPrice, eventZone } from '@/lib/format';
import { Stars } from '@/components/RatingControl';

export const dynamic = 'force-dynamic';

/**
 * Year in review.
 *
 * Built entirely from rows `/archive` already fetches — no queries of its own
 * and no provider calls, so it costs an arithmetic pass. The spend figures are
 * the part no other concert app can show: they come off the confirmation
 * emails, not from anything the user typed.
 */
export default async function YearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: raw } = await params;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) notFound();

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const rows = await getArchive(supabase, user!.id);

  const stats = summarizeYear(rows, year);
  const years = yearsWithShows(rows);

  return (
    <main className="page">
      <header className="page-header">
        <Link href="/archive" className="muted" style={{ fontSize: 14 }}>&larr; Archive</Link>
        <h1 style={{ marginTop: 8 }}>{year}</h1>
        <div className="sub">
          {stats.shows === 0
            ? 'No shows this year'
            : `${stats.shows} show${stats.shows === 1 ? '' : 's'} · ${stats.artists} artist${stats.artists === 1 ? '' : 's'}`}
        </div>
      </header>

      {stats.shows === 0 ? (
        <div className="empty">
          <h2>Nothing logged for {year}</h2>
          <p>Shows appear here once their date has passed.</p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Shows" value={String(stats.shows)} />
            <Stat label="Artists" value={String(stats.artists)} />
            <Stat label="Venues" value={String(stats.venues)} />
            <Stat label="Cities" value={String(stats.cities)} />
            {stats.totalCents !== null && (
              <Stat
                label="Spent on tickets"
                value={formatPrice(stats.totalCents) ?? '—'}
                /*
                 * Say what the number covers. A total over 3 of 11 shows is a
                 * useful figure and a misleading headline, so the denominator
                 * travels with it rather than being implied.
                 */
                note={
                  stats.pricedShows < stats.shows
                    ? `from ${stats.pricedShows} of ${stats.shows} with a receipt`
                    : undefined
                }
              />
            )}
            {stats.tickets !== null && <Stat label="Tickets bought" value={String(stats.tickets)} />}
            {stats.newArtists > 0 && (
              <Stat label="Seen for the first time" value={String(stats.newArtists)} />
            )}
            {stats.averageRating !== null && (
              <Stat
                label="Average rating"
                value={stats.averageRating.toFixed(1)}
                note={`across ${stats.ratedShows} rated`}
              />
            )}
          </div>

          <section>
            <div className="section-label">Most seen</div>
            <div className="stack" style={{ gap: 10 }}>
              {stats.topArtist && (
                <Highlight
                  label="Artist"
                  value={stats.topArtist.name}
                  note={stats.topArtist.count > 1 ? `${stats.topArtist.count} times` : 'once'}
                />
              )}
              {stats.topVenue && (
                <Highlight
                  label="Venue"
                  value={stats.topVenue.name}
                  note={stats.topVenue.count > 1 ? `${stats.topVenue.count} shows` : 'one show'}
                />
              )}
              {stats.busiestMonth && (
                <Highlight
                  label="Busiest month"
                  value={stats.busiestMonth.month}
                  note={`${stats.busiestMonth.count} show${stats.busiestMonth.count === 1 ? '' : 's'}`}
                />
              )}
            </div>
          </section>

          <section>
            <div className="section-label">Bookends</div>
            <div className="stack" style={{ gap: 10 }}>
              {stats.first && <Bookend label="First" row={stats.first} />}
              {stats.last && stats.last.id !== stats.first?.id && (
                <Bookend label="Last" row={stats.last} />
              )}
            </div>
          </section>
        </>
      )}

      {years.length > 1 && (
        <section>
          <div className="section-label">Other years</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {years
              .filter((y) => y !== year)
              .map((y) => (
                <Link key={y} className="btn" href={`/year/${y}`}>{y}</Link>
              ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

function Highlight({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 12 }}>{label}</div>
        <div style={{ fontWeight: 600 }}>{value}</div>
      </div>
      <div className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{note}</div>
    </div>
  );
}

function Bookend({ label, row }: { label: string; row: AttendanceWithEvent }) {
  return (
    <Link href={`/event/${row.event.id}`} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 12 }}>{label}</div>
        <div style={{ fontWeight: 600 }}>{displayEventName(row.event)}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {formatEventDate(row.event.starts_at, eventZone(row.event))}
          {row.event.venue?.name ? ` · ${row.event.venue.name}` : ''}
        </div>
      </div>
      {row.rating != null && <Stars rating={row.rating} size={12} />}
    </Link>
  );
}
