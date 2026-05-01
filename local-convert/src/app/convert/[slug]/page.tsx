import { Metadata } from 'next';
import Link from 'next/link';
import ConvertPageClient from '@/components/Converter/ConvertPageClient';
import NotFoundClient from '@/components/Converter/NotFoundClient';
import { getFormat, isConversionSupported, getValidTargets } from '@/lib/formats';
import { parseSlug, getBaseUrl } from '@/lib/utils';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return { title: 'File Converter' };

  const { from, to } = parsed;
  const title = `Free ${from} to ${to} Converter — 100% Private & Local`;
  const description = `Convert ${from} to ${to} instantly in your browser. No uploads, no file size limits, total privacy. Free, secure, and runs entirely on your device with WASM.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/convert/${slug}`,
    },
    openGraph: { 
      title, 
      description, 
      type: 'website',
      url: `https://local-convert.com/convert/${slug}`,
    },
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
        <NotFoundClient />
      </main>
    );
  }

  const { from, to } = parsed;
  const fromFormat = getFormat(from);
  const supported = fromFormat && isConversionSupported(from, to);
  const baseUrl = getBaseUrl();

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

  // Breadcrumb Schema
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://local-convert.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Tools',
        item: 'https://local-convert.com/tools',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${from} to ${to}`,
        item: `https://local-convert.com/convert/${slug}`,
      },
    ],
  };

  return (
    <main className="main container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <ConvertPageClient 
        slug={slug}
        from={from}
        to={to}
        supported={supported ?? false}
        related={related}
        baseUrl={baseUrl}
      />
    </main>
  );
}
