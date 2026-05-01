import type { Metadata } from 'next';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const config = FEATURE_CONFIGS.inpaint;

export const metadata: Metadata = {
  title: 'AI Inpainting — Remove Objects from Photos for Free',
  description: config.intro,
  alternates: { canonical: '/inpaint' },
  openGraph: {
    title: 'Remove Unwanted Objects from Photos — PrintPerfect.ai',
    description: config.intro,
    url: '/inpaint',
    type: 'website',
  },
};

export default function Page() {
  return <FeaturePage config={config} />;
}
