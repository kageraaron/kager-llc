import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://waterairaudit.com',
  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.9,
      serialize(item) {
        const base = 'https://waterairaudit.com';
        if (item.url !== base && item.url !== base + '/' && !item.url.endsWith('/') && !item.url.endsWith('.html')) {
          item.url = item.url + '.html';
        }
        return item;
      },
    }),
  ],
  build: {
    format: 'file',
  },
});
