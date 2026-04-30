import Link from 'next/link';

export type FeaturePageConfig = {
  /** URL slug, e.g. "upscaler". */
  slug: string;
  /** Editor tool id this page funnels into. */
  toolId: 'upscale' | 'colorize' | 'inpaint' | 'restore' | 'remove-bg' | 'watermark-remove';
  /** H1 — should contain the primary keyword. */
  h1: string;
  /** SEO subtitle / opening paragraph. */
  intro: string;
  /** Three short benefit cards. */
  benefits: { title: string; body: string }[];
  /** Three "how it works" steps. */
  steps: { title: string; body: string }[];
  /** Common questions for the FAQ block (also feeds JSON-LD FAQPage). */
  faq: { q: string; a: string }[];
  /** Primary CTA button label. */
  cta: string;
};

export function FeaturePage({ config }: { config: FeaturePageConfig }) {
  const editorHref = `/editor?tool=${config.toolId}`;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: config.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const appJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `PrintPerfect.ai ${config.h1}`,
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: config.intro,
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          PrintPerfect<span className="text-accent">.ai</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-300">
          <Link href="/#features" className="hover:text-ink-50">All features</Link>
          <Link
            href={editorHref}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition"
          >
            Open editor
          </Link>
        </nav>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-12 pb-16 text-center">
        <p className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-ink-300 ring-1 ring-ink-800 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Free · Browser-based · Your photos never leave your device
        </p>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight max-w-4xl mx-auto leading-[1.05]">
          {config.h1}
        </h1>
        <p className="mt-6 text-lg text-ink-300 max-w-2xl mx-auto">{config.intro}</p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href={editorHref}
            className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition"
          >
            {config.cta}
          </Link>
          <Link
            href="/#prints"
            className="rounded-md px-5 py-3 text-sm font-medium text-ink-200 ring-1 ring-ink-700 hover:bg-ink-900 transition"
          >
            Print the result
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {config.benefits.map((b) => (
            <article key={b.title} className="rounded-xl ring-1 ring-ink-800 bg-ink-900/40 p-6">
              <h2 className="text-base font-semibold">{b.title}</h2>
              <p className="mt-2 text-sm text-ink-400 leading-relaxed">{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">
          How it works
        </h2>
        <ol className="mt-10 space-y-4">
          {config.steps.map((s, i) => (
            <li
              key={s.title}
              className="flex gap-5 rounded-xl ring-1 ring-ink-800 bg-ink-900/40 p-5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold">
                {i + 1}
              </div>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-400">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">
          Frequently asked questions
        </h2>
        <div className="mt-10 divide-y divide-ink-800 ring-1 ring-ink-800 rounded-xl bg-ink-900/40">
          {config.faq.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-ink-100">
                {f.q}
                <span className="text-ink-400 group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-400 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="rounded-2xl bg-gradient-to-br from-accent/20 to-ink-900 ring-1 ring-ink-800 p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Ready to try it?
          </h2>
          <p className="mt-3 text-ink-300">No signup. No watermark. No upload to a server.</p>
          <div className="mt-6">
            <Link
              href={editorHref}
              className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition"
            >
              {config.cta}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-800 mt-12 py-10 text-sm text-ink-400">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>&copy; {new Date().getFullYear()} Kager LLC. All rights reserved.</div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink-200">Privacy</Link>
            <Link href="/terms" className="hover:text-ink-200">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
