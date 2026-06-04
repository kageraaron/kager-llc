import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, readdirSync } from 'node:fs';

const SITE = 'https://www.ravewellness.org';

// Build a map of blog post URL -> lastmod (frontmatter `lastmod`, else `date`),
// so the sitemap reports accurate per-post freshness instead of build time.
// (@astrojs/sitemap can't call getCollection() at config time, so we read the
// frontmatter directly.)
const blogLastmod = {};
const blogDir = new URL('./src/content/blog/', import.meta.url);
for (const file of readdirSync(blogDir)) {
  if (!file.endsWith('.md')) continue;
  const slug = file.replace(/\.md$/, '');
  const src = readFileSync(new URL(file, blogDir), 'utf8');
  const fm = src.split('---')[1] ?? '';
  const lastmod = (fm.match(/^lastmod:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1];
  const date = (fm.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1];
  const when = lastmod || date;
  if (when) blogLastmod[`${SITE}/blog/${slug}.html`] = new Date(when).toISOString();
}

export default defineConfig({
  site: SITE,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [
    sitemap({
      changefreq: 'monthly',
      priority: 0.9,
      serialize(item) {
        if (item.url !== SITE && item.url !== SITE + '/' && !item.url.endsWith('/') && !item.url.endsWith('.html')) {
          item.url = item.url + '.html';
        }
        // Attach accurate per-post lastmod for blog URLs.
        if (blogLastmod[item.url]) {
          item.lastmod = blogLastmod[item.url];
        }
        return item;
      },
    }),
  ],
  build: {
    format: 'file', // output /mdma.html not /mdma/index.html
  },
});
