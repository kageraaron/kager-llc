'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

/**
 * The Archive list, with a filter over history the page has already fetched.
 *
 * `getArchive` returns the WHOLE history in one query with no pagination, so
 * filtering here costs nothing — no round trip, no debounce, no loading state.
 * That is why this is a filter over rows rather than a search endpoint, and why
 * it is deliberately not the same thing as Browse: Browse searches the world,
 * this searches what you have already seen.
 *
 * Rows arrive pre-rendered from the server component so `EventCard` stays a
 * server component — only the filtering is client-side.
 */
export interface ArchiveSection {
  year: string;
  items: { id: string; haystack: string; node: React.ReactNode }[];
}

/**
 * Below this the filter is clutter: a list you can take in with one or two
 * scrolls does not need searching, and an empty search box above three shows
 * makes a new archive look emptier than it is.
 */
const FILTER_THRESHOLD = 20;

export function ArchiveList({ sections, total }: { sections: ArchiveSection[]; total: number }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => i.haystack.includes(q)) }))
      // A year with nothing left drops out entirely, header and all.
      .filter((s) => s.items.length > 0);
  }, [sections, q]);

  const shown = filtered.reduce((n, s) => n + s.items.length, 0);
  const showFilter = total >= FILTER_THRESHOLD;

  return (
    <>
      {showFilter && (
        <div style={{ marginBottom: 10 }}>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by artist, venue or city"
            aria-label="Filter your archive"
          />
        </div>
      )}

      {/* Only worth the row when there is more than one year to jump between,
          and never while a filter is narrowing what those years contain. */}
      {!q && filtered.length > 1 && (
        <nav className="year-jump" aria-label="Jump to year">
          {filtered.map((s) => (
            <a key={s.year} href={`#year-${s.year}`}>{s.year}</a>
          ))}
        </nav>
      )}

      {q && (
        <p className="muted" aria-live="polite" style={{ margin: '0 0 10px' }}>
          {shown === 0
            ? 'No shows match'
            : `${shown} of ${total} show${total === 1 ? '' : 's'}`}
        </p>
      )}

      {filtered.map((s) => (
        <section key={s.year} id={`year-${s.year}`}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="section-label">{s.year} · {s.items.length}</div>
            <Link className="pill" href={`/year/${s.year}`}>Year in review &rarr;</Link>
          </div>
          {s.items.map((i) => (
            <div key={i.id}>{i.node}</div>
          ))}
        </section>
      ))}

      {q && shown === 0 && (
        <div className="empty">
          <h2>Nothing matches &ldquo;{query}&rdquo;</h2>
          <p>Try an artist, a venue, or a city.</p>
        </div>
      )}
    </>
  );
}
