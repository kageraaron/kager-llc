import type { Metadata } from 'next';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const config = FEATURE_CONFIGS.restore;

export const metadata: Metadata = {
  title: 'AI Photo Restoration — Sharpen Old & Blurry Portraits',
  description: config.intro,
  alternates: { canonical: '/restore' },
  openGraph: {
    title: 'Restore Old Photos with AI — PrintPerfect.ai',
    description: config.intro,
    url: '/restore',
    type: 'website',
  },
};

export default function Page() {
  return <FeaturePage config={config} />;
}
