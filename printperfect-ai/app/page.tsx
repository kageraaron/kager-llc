import Link from 'next/link';
import { Hero } from '@/components/marketing/Hero';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { PrivacyCallout } from '@/components/marketing/PrivacyCallout';
import { PrintCTA } from '@/components/marketing/PrintCTA';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PrintPerfect.ai',
  applicationCategory: 'PhotographyApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  description:
    'Free in-browser AI photo upscaler, colorizer, and restorer. Order prints of the finished result, shipped worldwide.',
};

export default function HomePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        // Safe: static, controlled string
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          PrintPerfect<span className="text-accent">.ai</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-300">
          <Link href="#features" className="hover:text-ink-50">Features</Link>
          <Link href="#prints" className="hover:text-ink-50">Prints</Link>
          <Link
            href="/editor"
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition"
          >
            Open editor
          </Link>
        </nav>
      </header>

      <Hero />
      <PrivacyCallout />
      <FeatureGrid />
      <PrintCTA />

      <footer className="border-t border-ink-800 mt-24 py-10 text-sm text-ink-400">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>&copy; {new Date().getFullYear()} Print Perfect AI. All rights reserved.</div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink-200">Privacy</Link>
            <Link href="/terms" className="hover:text-ink-200">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
