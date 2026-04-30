import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://local-convert.com'
  
  // Define all supported conversion pairs as defined in src/app/page.tsx
  const conversions = [
    'heic-to-png', 'heic-to-jpg', 'webp-to-png', 'webp-to-jpg', 
    'png-to-jpg', 'jpg-to-png', 'svg-to-png', 'tiff-to-png', 
    'png-to-webp', 'jpg-to-webp', 'mp4-to-mp3', 'wav-to-mp3', 
    'mov-to-mp4', 'webm-to-mp4', 'mp4-to-gif', 'gif-to-mp4',
    'pdf-to-jpg', 'pdf-to-png', 'jpg-to-pdf', 'png-to-pdf'
  ]

  const routes = conversions.map((slug) => ({
    url: `${baseUrl}/convert/${slug}`,
    lastModified: new Date(),
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
    ...routes,
  ]
}
