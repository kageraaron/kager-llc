/**
 * Shared skeleton for every tab.
 *
 * All five tab routes are `force-dynamic` and await several Supabase round
 * trips before rendering a byte, so tapping a tab used to leave the PREVIOUS
 * screen on-screen until the new one was ready — the app read as unresponsive
 * rather than slow. This lives at the group level so a new route gets it for
 * free; a page needing a different shape can still add its own `loading.tsx`.
 *
 * The shapes mirror `.card` deliberately: a skeleton whose geometry does not
 * match what replaces it produces a visible jump on load.
 */
export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <header className="page-header">
        <div className="skeleton" style={{ width: 180, height: 32, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 110, height: 14, borderRadius: 6, marginTop: 8 }} />
      </header>

      {[0, 1, 2, 3].map((i) => (
        <div className="card" key={i} aria-hidden="true">
          <div className="date-chip">
            <div className="skeleton" style={{ width: 26, height: 10, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 22, height: 20, borderRadius: 5, marginTop: 5 }} />
          </div>
          <div className="skeleton thumb" />
          <div className="body">
            <div className="skeleton" style={{ width: '55%', height: 15, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: '75%', height: 12, borderRadius: 6, marginTop: 8 }} />
            <div className="skeleton" style={{ width: '35%', height: 12, borderRadius: 6, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </main>
  );
}
