import { MetadataRoute } from 'next'
import { FORMATS, getValidTargets } from '@/lib/formats'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://local-convert.com'
  
  // Dynamically generate all supported conversion pairs
  const dynamicRoutes = FORMATS.flatMap((format) => {
    const targets = getValidTargets(format.code);
    return targets.map((target) => ({
      url: `${baseUrl}/convert/${format.code.toLowerCase()}-to-${target.toLowerCase()}`,
      lastModified: new Date(),
    }));
  });

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/tools`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
    },
    ...dynamicRoutes,
  ]
}
