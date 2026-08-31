'use client';

/**
 * Error boundary INSIDE the app shell.
 *
 * Every read in `queries.ts` throws on failure. Without this the throw escaped
 * to Next's default error page, which renders outside `(app)/layout.tsx` — no
 * tab bar, so a transient network blip stranded the user with no way back.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Something broke</h1>
      </header>
      <div className="empty">
        <h2>That didn&rsquo;t load</h2>
        <p>
          Usually a dropped connection rather than anything lost — your shows are
          safe. Try again, or switch tabs and come back.
        </p>
        <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
          <button className="btn btn-primary btn-block" onClick={reset}>Try again</button>
        </div>
      </div>
    </main>
  );
}
