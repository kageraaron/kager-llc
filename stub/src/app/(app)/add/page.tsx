import Link from 'next/link';
import { ManualEventForm } from '@/components/ManualEventForm';

export const dynamic = 'force-dynamic';

/**
 * Add a show by hand.
 *
 * Manual entry used to live only inside Browse, which made it a sub-feature of
 * discovery. For a memory app that is backwards: the shows worth recording are
 * often the ones no listing service ever had — a club night, a warehouse party,
 * something from years ago — so adding one by hand is a primary action, not a
 * fallback for when search fails.
 */
export default function AddPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Add a show</h1>
        <div className="sub">Something you are going to, or something you already saw</div>
      </header>

      <ManualEventForm />

      <p className="muted" style={{ marginTop: 20, lineHeight: 1.55, fontSize: 13 }}>
        Most shows arrive on their own — Stub reads ticket confirmations from
        your inbox. This is for the ones it cannot find, and for filling in
        history from before you connected Gmail.
      </p>

      <div className="stack" style={{ marginTop: 20 }}>
        <Link className="btn btn-block" href="/settings/connections">Connect Gmail</Link>
        <Link className="btn btn-block" href="/browse">Search listings instead</Link>
      </div>
    </main>
  );
}
