import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getArchive } from '@/lib/queries';
import { EventCard } from '@/components/EventCard';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const rows = await getArchive(supabase, user!.id);

  // Group by year so a long history stays scannable.
  const byYear = new Map<string, typeof rows>();
  for (const row of rows) {
    const year = new Date(row.event.starts_at).getFullYear().toString();
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
            <div className="section-label">{year} · {yearRows.length}</div>
            {yearRows.map((row) => (
              <EventCard key={row.id} event={row.event} rating={row.rating} />
            ))}
          </section>
        ))
      )}
    </main>
  );
}
