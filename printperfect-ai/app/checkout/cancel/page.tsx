import Link from 'next/link';

export const metadata = {
  title: 'Checkout cancelled',
  robots: { index: false, follow: false },
};

export default function CancelPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout cancelled</h1>
      <p className="mt-3 text-ink-300">
        No charge was made. Your image is still in the editor — pick up where you left off whenever
        you're ready.
      </p>
      <div className="mt-10 flex items-center justify-center gap-3">
        <Link
          href="/editor"
          className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition"
        >
          Back to editor
        </Link>
      </div>
    </main>
  );
}
