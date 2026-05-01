import type { Metadata } from 'next';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const config = FEATURE_CONFIGS.upscaler;

export const metadata: Metadata = {
  title: 'Free AI Image Upscaler — 4× Upscale in Your Browser',
  description: config.intro,
  alternates: { canonical: '/upscaler' },
  openGraph: {
    title: 'Free AI Image Upscaler — PrintPerfect.ai',
    description: config.intro,
    url: '/upscaler',
    type: 'website',
  },
};

export default function Page() {
  return <FeaturePage config={config} />;
}
