import EmbedPageClient from '@/components/Converter/EmbedPageClient';
import { getFormat, isConversionSupported } from '@/lib/formats';
import { parseSlug, getBaseUrl } from '@/lib/utils';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EmbedPage({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parseSlug(slug);

  if (!parsed) {
    return notFound();
  }

  const { from, to } = parsed;
  const fromFormat = getFormat(from);
  const supported = fromFormat && isConversionSupported(from, to);
  const baseUrl = getBaseUrl();

  return (
    <EmbedPageClient 
      from={from}
      to={to}
      supported={supported ?? false}
      baseUrl={baseUrl}
    />
  );
}
