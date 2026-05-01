import type { Metadata } from 'next';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const config = FEATURE_CONFIGS['background-remover'];

export const metadata: Metadata = {
  title: 'Free AI Background Remover — Transparent PNGs in One Click',
  description: config.intro,
  alternates: { canonical: '/background-remover' },
  openGraph: {
    title: 'Remove Image Backgrounds Free — PrintPerfect.ai',
    description: config.intro,
    url: '/background-remover',
    type: 'website',
  },
};

export default function Page() {
  return <FeaturePage config={config} />;
}
