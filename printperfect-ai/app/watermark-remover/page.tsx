import type { Metadata } from 'next';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const config = FEATURE_CONFIGS['watermark-remover'];

export const metadata: Metadata = {
  title: 'Free Watermark Remover — Erase Watermarks from Images',
  description: config.intro,
  alternates: { canonical: '/watermark-remover' },
  openGraph: {
    title: 'Remove Watermarks from Images — PrintPerfect.ai',
    description: config.intro,
    url: '/watermark-remover',
    type: 'website',
  },
};

export default function Page() {
  return <FeaturePage config={config} />;
}
