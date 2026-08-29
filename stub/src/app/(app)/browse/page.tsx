'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { addEventFromSearch } from '@/app/actions';
import { formatEventDate } from '@/lib/format';
import { ManualEventForm } from '@/components/ManualEventForm';

interface EventHit {
  source: 'jambase' | 'ticketmaster';
  id: string;
  name: string;
  artist: string | null;
  startsAt: string | null;
  timezone: string | null;
  image: string | null;
  venue: string | null;
  city: string | null;
  region: string | null;
  isFestival: boolean;
}

/**
 * Search shows by artist, by location, or both.
 *
 * Backed by JamBase where configured, which is what makes "Overmono in San
 * Francisco" work — Ticketmaster misses it because that date is a festival set
 * it doesn't sell tickets to.
 */
export default function BrowsePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    key: string;
    events: EventHit[];
    source: string | null;
    page: number;
    hasMore: boolean;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(50);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const nearMe = coords !== null;
  const q = query.trim();
  // A location alone is a valid search — that is the "what's on near me" case.
  const canSearch = q.length >= 2 || nearMe;
  const searchKey = `${q}|${coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)},${radius}` : ''}`;

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError('This browser has no location support.');
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied.'
            : 'Could not get your location.',
        );
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  const fetchPage = useCallback(
    async (page: number, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (q.length >= 2) params.set('q', q);
      if (coords) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
        params.set('radius', String(radius));
      }
      params.set('page', String(page));

      const res = await fetch(`/api/search/events?${params}`, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Search failed');
      return {
        key: searchKey,
        events: json.events as EventHit[],
        source: (json.source as string | null) ?? null,
        page: (json.page as number) ?? page,
        hasMore: Boolean(json.hasMore),
      };
    },
    [q, coords, radius, searchKey],
  );

  // Debounced, and aborted on supersede — a slow response for a half-typed
  // query must never overwrite a newer one.
  useEffect(() => {
    if (!canSearch) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await fetchPage(1, controller.signal));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 320);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, fetchPage]);

  /**
   * Append the next page.
   *
   * Guarded on the results key so a page-2 response cannot land on top of a
   * different search — the same class of bug the AbortController prevents for
   * page 1, but appending needs its own check because it resolves later.
   */
  const loadMore = useCallback(async () => {
    if (!results || !results.hasMore || loadingMore) return;
    const keyAtRequest = results.key;

    setLoadingMore(true);
    try {
      const next = await fetchPage(results.page + 1);
      setResults((prev) => {
        if (!prev || prev.key !== keyAtRequest) return prev; // superseded
        const seen = new Set(prev.events.map((e) => `${e.source}:${e.id}`));
        return {
          ...prev,
          page: next.page,
          hasMore: next.hasMore,
          events: [...prev.events, ...next.events.filter((e) => !seen.has(`${e.source}:${e.id}`))],
        };
      });
    } catch {
      // A failed page-2 should not clear what is already on screen.
    } finally {
      setLoadingMore(false);
    }
  }, [results, loadingMore, fetchPage]);

  // Infinite scroll: fire when the sentinel below the list comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !results?.hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [results?.hasMore, loadMore]);

  function add(hit: EventHit) {
    setError(null);
    startTransition(async () => {
      const res = await addEventFromSearch(hit.source, hit.id);
      if (res.ok) {
        setAdded((prev) => new Set(prev).add(hit.id));
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const events = results?.events ?? [];
  const resultsAreCurrent = results?.key === searchKey;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Browse</h1>
        <div className="sub">
          {nearMe ? 'Shows near you' : 'Search an artist, or find what’s on nearby'}
        </div>
      </header>

      <input
        className="input"
        placeholder="Artist name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
      />

      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        {!nearMe ? (
          <button className="btn" disabled={locating} onClick={useMyLocation}>
            {locating ? 'Locating…' : 'Near me'}
          </button>
        ) : (
          <>
            <span className="pill pill-going">Near you</span>
            <select
              className="input"
              style={{ width: 'auto', padding: '6px 10px', fontSize: 14 }}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((r) => (
                <option key={r} value={r}>within {r} mi</option>
              ))}
            </select>
            <button
              className="muted"
              style={{ fontSize: 12, textDecoration: 'underline' }}
              onClick={() => setCoords(null)}
            >
              Clear
            </button>
          </>
        )}
      </div>

      {locError && <p className="error" style={{ marginTop: 8 }}>{locError}</p>}
      {loading && <p className="muted" style={{ marginTop: 12 }}>Searching…</p>}

      <div style={{ marginTop: 14 }}>
        {events.map((ev) => {
          const isAdded = added.has(ev.id);
          return (
            <div key={`${ev.source}:${ev.id}`} className="card">
              {ev.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="thumb" src={ev.image} alt="" loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div className="body">
                <div className="title">{ev.artist ?? ev.name}</div>
                <div className="meta">
                  {ev.startsAt ? formatEventDate(ev.startsAt, ev.timezone) : 'Date TBA'}
                </div>
                <div className="meta">
                  {[ev.venue, ev.city, ev.region].filter(Boolean).join(' · ')}
                </div>
                {ev.isFestival && (
                  <div style={{ marginTop: 5 }}>
                    <span className="pill">Festival · {ev.name}</span>
                  </div>
                )}
              </div>
              <button
                className={`btn ${isAdded ? '' : 'btn-primary'}`}
                style={{ alignSelf: 'center' }}
                disabled={pending || isAdded}
                onClick={() => add(ev)}
              >
                {isAdded ? 'Added' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>

      {canSearch && !loading && resultsAreCurrent && events.length === 0 && (
        <div className="empty">
          <h2>Nothing found</h2>
          <p>
            {nearMe
              ? 'No upcoming shows in that radius. Try widening it.'
              : 'Artist names are matched in full, so a half-typed name finds nothing.'}
          </p>
        </div>
      )}

      {/* No listings service is complete — club nights and afterparties are
          routinely absent from all of them — so manual entry is always offered,
          not just when a search comes back empty. */}
      <section style={{ marginTop: 28 }}>
        {!manual ? (
          <button className="btn btn-block" onClick={() => setManual(true)}>
            Can&rsquo;t find it? Add a show manually
          </button>
        ) : (
          <>
            <div className="spread">
              <div className="section-label" style={{ margin: 0 }}>Add manually</div>
              <button
                className="muted"
                style={{ fontSize: 12, textDecoration: 'underline' }}
                onClick={() => setManual(false)}
              >
                Cancel
              </button>
            </div>
            <p className="muted" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
              For shows no listings service has — club nights, afterparties, DIY bills.
            </p>
            <ManualEventForm onDone={() => setManual(false)} />
          </>
        )}
      </section>

      {/* Sentinel: sits below the list so the observer fires before the user
          reaches the bottom (rootMargin 400px). */}
      {results?.hasMore && <div ref={sentinel} style={{ height: 1 }} />}

      {loadingMore && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 12 }}>Loading more…</p>
      )}

      {results?.source && events.length > 0 && (
        <p className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 16 }}>
          {events.length} shown{results.hasMore ? '' : ' · that’s everything'} · via{' '}
          {results.source === 'jambase' ? 'JamBase' : 'Ticketmaster'}
        </p>
      )}

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
    </main>
  );
}
