import type { Metadata } from 'next';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const config = FEATURE_CONFIGS.colorize;

export const metadata: Metadata = {
  title: 'AI Photo Colorizer — Colorize Black & White Photos Free',
  description: config.intro,
  alternates: { canonical: '/colorize' },
  openGraph: {
    title: 'Colorize Black & White Photos with AI — PrintPerfect.ai',
    description: config.intro,
    url: '/colorize',
    type: 'website',
  },
};

export default function Page() {
  return <FeaturePage config={config} />;
}
