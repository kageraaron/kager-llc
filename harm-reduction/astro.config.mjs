import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ravewellness.org',
  integrations: [
    sitemap({
      changefreq: 'monthly',
      priority: 0.9,
      serialize(item) {
        const base = 'https://www.ravewellness.org';
        if (item.url !== base && item.url !== base + '/' && !item.url.endsWith('/') && !item.url.endsWith('.html')) {
          item.url = item.url + '.html';
        }
        return item;
      },
    }),
  ],
  build: {
    format: 'file', // output /mdma.html not /mdma/index.html
  },
});
