import Link from 'next/link';
import Converter from '@/components/Converter/Converter';
import AdSlot from '@/components/Ads/AdSlot';
import { CONVERSION_CATEGORIES } from '@/lib/formats';

const FEATURE_ICONS: Record<string, React.ReactElement> = {
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  infinity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M18.178 8a5 5 0 1 0 0 8c1.414 0 2.768-.586 3.768-1.628L22 14M6.178 16a5 5 0 1 1 0-8c1.414 0 2.768.586 3.768 1.628l9.054 8.744" />
    </svg>
  ),
};

export default function Home() {
  return (
    <main className="main container">
      {/* Hero with inline converter — drop a file and go */}
      <section className="hero">
        <div className="hero__eyebrow">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          100% local • No uploads • No sign-in
        </div>
        <h1 className="hero__title">
          Convert files <span style={{ color: 'var(--primary)' }}>without leaving</span> your browser.
        </h1>
        <p className="hero__subtitle">
          Drop your images, videos, audio or PDFs below. Everything is processed on your device with WebAssembly —
          fast, private, and free.
        </p>
      </section>

      <div style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
        <Converter />
      </div>

      <AdSlot format="banner" style={{ marginTop: '3rem' }} />

      {/* Conversion catalog */}
      <section id="tools" style={{ marginTop: '5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Every conversion you need</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Each link below is its own SEO landing page — bookmark the formats you use most.
          </p>
        </div>

        {CONVERSION_CATEGORIES.map((category) => (
          <div key={category.name} style={{ marginBottom: '3rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.35rem', marginBottom: '0.25rem' }}>{category.name}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{category.description}</p>
            </div>
            <div className="catalog-grid">
              {category.conversions.map((conv) => (
                <Link
                  key={`${conv.from}-${conv.to}`}
                  href={`/convert/${conv.from.toLowerCase()}-to-${conv.to.toLowerCase()}`}
                  className="catalog-tile"
                >
                  <span className="catalog-tile__route">Convert</span>
                  <span className="catalog-tile__title">
                    {conv.from} <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>→</span>{' '}
                    <strong>{conv.to}</strong>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <AdSlot format="banner" style={{ height: 250, maxWidth: 970, marginTop: '2rem' }} />

      {/* Why local */}
      <section
        id="why"
        style={{
          marginTop: '5rem',
          padding: '3rem 2rem',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          <h2>Why convert locally?</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Most "online" converters quietly upload your files to a server. We don't.
          </p>
        </div>

        <div className="feature-grid">
          <div className="feature">
            <div className="feature__icon">{FEATURE_ICONS.shield}</div>
            <h3>Privacy by design</h3>
            <p>
              Conversion runs in a sandboxed WebAssembly engine inside your browser tab. Your files never travel
              over the network — there's literally no server to leak them.
            </p>
          </div>
          <div className="feature">
            <div className="feature__icon">{FEATURE_ICONS.zap}</div>
            <h3>Instant results</h3>
            <p>
              No upload bar, no download bar, no queue. Conversions start the moment you drop a file and finish as
              fast as your machine can crunch them.
            </p>
          </div>
          <div className="feature">
            <div className="feature__icon">{FEATURE_ICONS.infinity}</div>
            <h3>No artificial limits</h3>
            <p>
              You're using your own CPU and memory, so there's no need for size caps or daily quotas. Convert a
              1&nbsp;GB video the same way you'd convert a tiny icon.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" style={{ marginTop: '5rem', textAlign: 'center' }}>
        <h2>Free for everyone</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 540, margin: '0.75rem auto 0' }}>
          Local conversion will always be free and ad-supported. A premium tier with cloud features is coming
          soon for teams that need shared workflows.
        </p>
      </section>
    </main>
  );
}
