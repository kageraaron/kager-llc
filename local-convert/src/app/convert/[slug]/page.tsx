import { Metadata } from 'next';
import Link from 'next/link';
import Converter from '@/components/Converter/Converter';
import AdSlot from '@/components/Ads/AdSlot';
import { getFormat, isConversionSupported, getValidTargets } from '@/lib/formats';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

function parseSlug(slug: string): { from: string; to: string } | null {
  const parts = slug.split('-to-');
  if (parts.length !== 2) return null;
  return { from: parts[0].toUpperCase(), to: parts[1].toUpperCase() };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return { title: 'File Converter' };

  const { from, to } = parsed;
  const title = `Free ${from} to ${to} Converter — 100% Private & Local`;
  const description = `Convert ${from} to ${to} instantly in your browser. No uploads, no file size limits, total privacy. Free, secure, and runs entirely on your device.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// Pre-render the highest-traffic conversions for SEO.
export async function generateStaticParams() {
  const commonConversions = [
    'heic-to-jpg', 'heic-to-png',
    'webp-to-png', 'webp-to-jpg',
    'png-to-jpg', 'jpg-to-png',
    'svg-to-png', 'tiff-to-png',
    'pdf-to-jpg', 'pdf-to-png',
    'jpg-to-pdf', 'png-to-pdf',
    'mp4-to-mp3', 'mov-to-mp4', 'webm-to-mp4', 'mp4-to-gif', 'wav-to-mp3',
  ];
  return commonConversions.map((slug) => ({ slug }));
}

export default async function ConvertPage({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parseSlug(slug);

  if (!parsed) {
    return (
      <main className="main container">
        <div style={{ padding: '4rem 0', textAlign: 'center' }}>
          <h1>Conversion not found</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            The URL doesn't match a recognized format. Pick a conversion below.
          </p>
          <Link href="/" className="btn btn--primary btn--lg" style={{ marginTop: '2rem' }}>
            Browse all tools
          </Link>
        </div>
      </main>
    );
  }

  const { from, to } = parsed;
  const fromFormat = getFormat(from);
  const supported = fromFormat && isConversionSupported(from, to);

  // Suggest related conversions for cross-linking (boosts internal SEO graph).
  const related = fromFormat
    ? getValidTargets(from)
        .filter((t) => t !== to)
        .slice(0, 6)
        .map((t) => ({ from, to: t }))
    : [];

  // Schema.org HowTo + FAQ JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to convert ${from} to ${to} locally`,
    description: `Step-by-step guide to convert ${from} files to ${to} using your browser's local processing power.`,
    step: [
      { '@type': 'HowToStep', name: 'Add file', text: `Drag a ${from} file into the dropzone or click to browse.` },
      { '@type': 'HowToStep', name: 'Convert', text: `Click "Convert" — the file is processed entirely on your device.` },
      { '@type': 'HowToStep', name: 'Download', text: `Save your new ${to} file. Nothing was uploaded.` },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Is it safe to convert ${from} to ${to} online?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes. Conversion runs in your browser with WebAssembly, so your file never leaves your device or touches a server.`,
        },
      },
      {
        '@type': 'Question',
        name: `Is there a file size limit?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `No artificial limit — only your browser's available memory and CPU.`,
        },
      },
      {
        '@type': 'Question',
        name: `Do I need to install anything?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `No. Everything runs in modern browsers using WebAssembly and Web Workers — no plugins or downloads.`,
        },
      },
    ],
  };

  return (
    <main className="main container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Breadcrumb-style header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginBottom: '1.25rem',
        }}
      >
        <Link href="/">Home</Link>
        <span>·</span>
        <span>{from} to {to}</span>
      </div>

      <section className="hero" style={{ marginTop: 0 }}>
        <h1 className="hero__title">
          {from} to {to} <span style={{ color: 'var(--primary)' }}>converter</span>
        </h1>
        <p className="hero__subtitle">
          Drop a {from} file below to get a {to} back in seconds. Everything is processed locally — no uploads,
          no signups, no file size limits.
        </p>
      </section>

      {/* Inline converter — pinned to this format pair */}
      <div style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
        {supported ? (
          <Converter from={from} to={to} />
        ) : (
          <div
            className="card"
            style={{ textAlign: 'center', padding: '2.5rem' }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>That conversion isn't supported yet</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              We can't convert {from} → {to} in the browser yet. Try one of the related conversions below.
            </p>
            <Link href="/" className="btn btn--primary">Browse all tools</Link>
          </div>
        )}
      </div>

      <AdSlot format="banner" style={{ marginTop: '3rem' }} />

      {/* Why this tool */}
      <section style={{ marginTop: '4rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          Why our {from} → {to} converter?
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto' }}>
          Built for people who care where their files go.
        </p>

        <div className="feature-grid">
          <div className="feature">
            <h3>Total privacy</h3>
            <p>
              Your {from} file is decoded and re-encoded inside the browser tab. No server, no upload, no
              telemetry — even on huge files.
            </p>
          </div>
          <div className="feature">
            <h3>Blazing fast</h3>
            <p>
              No upload step means conversion starts immediately. Most files finish in less time than it would take
              to send them anywhere.
            </p>
          </div>
          <div className="feature">
            <h3>Free, no limits</h3>
            <p>
              No subscription, no daily quota, no "Pro" tier blocking large files. The free version is the full
              version.
            </p>
          </div>
        </div>
      </section>

      {/* Related conversions */}
      {related.length > 0 && (
        <section style={{ marginTop: '4rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>More from {from}</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Other formats you can convert {from} to.
          </p>
          <div className="catalog-grid">
            {related.map((conv) => (
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
        </section>
      )}

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '5rem auto 0' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Frequently asked</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <details className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              Is this {from} → {to} converter safe for sensitive documents?
            </summary>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Yes. Conversion happens entirely inside the browser tab using WebAssembly and Web Workers. There's
              no server endpoint that could leak the file content.
            </p>
          </details>
          <details className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Do I need to install anything?</summary>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              No. Any modern browser (Chrome, Firefox, Safari, Edge) is enough — there are no plugins or
              downloads.
            </p>
          </details>
          <details className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>What's the file size limit?</summary>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              There isn't one we impose. The practical limit is whatever your machine can fit in memory.
            </p>
          </details>
        </div>
      </section>
    </main>
  );
}
