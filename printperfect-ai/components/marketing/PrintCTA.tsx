import Link from 'next/link';

export function PrintCTA() {
  return (
    <section id="prints" className="max-w-6xl mx-auto px-6 py-20">
      <div className="rounded-2xl bg-gradient-to-br from-accent/20 to-ink-900 ring-1 ring-ink-800 p-10 sm:p-14 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Skip the trip to the print shop.
        </h2>
        <p className="mt-4 text-ink-300 max-w-2xl mx-auto">
          When you're happy with your edit, order it as a canvas, framed, metal, or poster print.
          We handle production and shipping through our fulfillment partners — you just wait for the
          knock at the door.
        </p>
        <div className="mt-8">
          <Link
            href="/editor"
            className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition"
          >
            Start editing
          </Link>
        </div>
      </div>
    </section>
  );
}
