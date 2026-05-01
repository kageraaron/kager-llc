import type { MetadataRoute } from 'next';

/**
 * robots.txt — let crawlers index everything except API routes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: 'https://printperfect.ai/sitemap.xml',
  };
}
