import type { MetadataRoute } from 'next';
import { FEATURE_CONFIGS } from '@/lib/seo/feature-configs';

const SITE = 'https://printperfect.ai';

/**
 * Sitemap for indexing. Per-feature pages are included so they can rank
 * independently for their target keyword.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const featurePages = Object.values(FEATURE_CONFIGS).map((c) => ({
    url: `${SITE}/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE}/editor`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...featurePages,
  ];
}
