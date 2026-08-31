import Link from 'next/link';

/**
 * 404 inside the app shell — `event/[id]` and `profile/[handle]` both call
 * `notFound()`, and the framework default drops the tab bar with it.
 */
export default function AppNotFound() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Not found</h1>
      </header>
      <div className="empty">
        <h2>Nothing here</h2>
        <p>This show or profile may have been removed, or the link was mistyped.</p>
        <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
          <Link className="btn btn-primary btn-block" href="/upcoming">Back to Upcoming</Link>
        </div>
      </div>
    </main>
  );
}
