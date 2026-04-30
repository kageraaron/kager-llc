import Link from 'next/link';
import { CONVERSION_CATEGORIES } from '@/lib/formats';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'All Conversion Tools | Local-Convert',
  description: 'Browse our full catalog of 100% private, local file conversion tools.',
};

export default function ToolsPage() {
  return (
    <main className="main container">
      <section className="hero">
        <h1 className="hero__title">
          All <span style={{ color: 'var(--primary)' }}>conversion</span> tools
        </h1>
        <p className="hero__subtitle">
          Secure, browser-based conversion for all your files. No uploads, no waiting.
        </p>
      </section>

      <div style={{ marginTop: '3rem' }}>
        {CONVERSION_CATEGORIES.map((category) => (
          <div key={category.name} style={{ marginBottom: '4rem' }}>
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{category.name}</h2>
              <p style={{ color: 'var(--text-muted)' }}>{category.description}</p>
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
      </div>
    </main>
  );
}
