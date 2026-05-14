import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog');
  const sorted = posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'Rave Wellness — Harm Reduction Blog',
    description: 'Evidence-based harm reduction guides for the rave and festival community. Drug safety, interactions, and peer-reviewed research.',
    site: context.site!,
    items: sorted.map(post => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}.html`,
    })),
    customData: `<language>en-us</language>`,
  });
}
