import Link from 'next/link';

export const metadata = {
  title: 'Order placed',
  robots: { index: false, follow: false },
};

export default function SuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  return (
    <main className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-400/30">
        <span className="text-3xl text-emerald-400">✓</span>
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Payment received</h1>
      <p className="mt-3 text-ink-300">
        Your print order has been queued for fulfillment. You'll get an email confirmation shortly,
        followed by a tracking number when it ships.
      </p>
      {searchParams.session_id && (
        <p className="mt-4 text-xs text-ink-500">
          Reference: <code className="text-ink-300">{searchParams.session_id}</code>
        </p>
      )}
      <div className="mt-10 flex items-center justify-center gap-3">
        <Link
          href="/editor"
          className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition"
        >
          Edit another photo
        </Link>
        <Link
          href="/"
          className="rounded-md px-5 py-3 text-sm font-medium text-ink-200 ring-1 ring-ink-700 hover:bg-ink-900 transition"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
