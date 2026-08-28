'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addEventByTmId } from '@/app/actions';
import { formatEventDate } from '@/lib/format';

interface ArtistHit { tmId: string; name: string; image: string | null; genres: string[] }
interface EventHit {
  tmId: string;
  name: string;
  startsAt: string | null;
  timezone: string | null;
  image: string | null;
  artist: string | null;
  venue: string | null;
  city: string | null;
  region: string | null;
}

/**
 * Search for an artist, then pick a date. This is also the manual-add path -
 * the equivalent of Shop letting you enter a carrier and tracking number when
 * the automatic scan misses an order.
 */
export default function BrowsePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; artists: ArtistHit[] } | null>(null);
  const [selected, setSelected] = useState<ArtistHit | null>(null);
  const [events, setEvents] = useState<EventHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const artists = results?.artists ?? [];
  // Only trust the empty state when the settled results match what's in the box.
  const resultsAreCurrent = results?.query === query.trim();

  /**
   * Debounced artist search.
   *
   * Two things have to be right here, and both bit us:
   *
   * 1. Superseded requests must be ABORTED, not just have their timer cleared.
   *    Clearing the timeout does nothing once fetch has started, so a slow
   *    response for "Chris L" could land after the one for "Chris Lake" and
   *    overwrite good results with none.
   * 2. Results are stored WITH the query that produced them, so we only render
   *    "no results" for the text currently in the box. Ticketmaster matches
   *    whole words only — "Chris L" genuinely returns nothing — so without this
   *    the empty state flickers on every keystroke mid-word.
   */
  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search/artists?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Search failed');
        setResults({ query: q, artists: json.artists });
      } catch (err) {
        // An aborted request was superseded by a newer one; not an error.
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
  }, [query, selected]);

  async function openArtist(artist: ArtistHit) {
    setSelected(artist);
    setResults(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search/events?attractionId=${encodeURIComponent(artist.tmId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not load dates');
      setEvents(json.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dates');
    } finally {
      setLoading(false);
    }
  }

  function add(ev: EventHit) {
    setError(null);
    startTransition(async () => {
      const res = await addEventByTmId(ev.tmId);
      if (res.ok) {
        setAdded((prev) => new Set(prev).add(ev.tmId));
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Browse</h1>
        <div className="sub">Search an artist to find and add a show</div>
      </header>

      {selected ? (
        <>
          <button
            className="btn"
            style={{ marginBottom: 14 }}
            onClick={() => { setSelected(null); setEvents([]); }}
          >
            &larr; {selected.name}
          </button>

          {loading && <p className="muted">Loading dates...</p>}
          {!loading && events.length === 0 && (
            <div className="empty">
              <h2>No upcoming dates</h2>
              <p>Ticketmaster has no scheduled events for {selected.name} right now.</p>
            </div>
          )}

          {events.map((ev) => (
            <div key={ev.tmId} className="card">
              <div className="body">
                <div className="title">{ev.artist ?? ev.name}</div>
                <div className="meta">
                  {ev.startsAt ? formatEventDate(ev.startsAt, ev.timezone) : 'Date TBA'}
                </div>
                <div className="meta">
                  {[ev.venue, ev.city, ev.region].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                className={`btn ${added.has(ev.tmId) ? '' : 'btn-primary'}`}
                style={{ alignSelf: 'center' }}
                disabled={pending || added.has(ev.tmId)}
                onClick={() => add(ev)}
              >
                {added.has(ev.tmId) ? 'Added' : 'Add'}
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <input
            className="input"
            placeholder="Search artists"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
          />

          {loading && <p className="muted" style={{ marginTop: 12 }}>Searching...</p>}

          <div style={{ marginTop: 12 }}>
            {artists.map((a) => (
              <button
                key={a.tmId}
                className="card"
                style={{ width: '100%', textAlign: 'left', alignItems: 'center' }}
                onClick={() => openArtist(a)}
              >
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="thumb" src={a.image} alt="" style={{ borderRadius: '50%' }} />
                ) : (
                  <div className="thumb" style={{ borderRadius: '50%' }} />
                )}
                <div className="body">
                  <div className="title">{a.name}</div>
                  {a.genres.length > 0 && <div className="meta">{a.genres.join(' · ')}</div>}
                </div>
              </button>
            ))}
          </div>

          {query.trim().length >= 2 && !loading && resultsAreCurrent && artists.length === 0 && (
            <div className="empty">
              <h2>No artists found</h2>
              <p>
                Ticketmaster matches whole words, so a half-typed name finds nothing.
                Try finishing the name, or search just the surname.
              </p>
            </div>
          )}
        </>
      )}

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
    </main>
  );
}
