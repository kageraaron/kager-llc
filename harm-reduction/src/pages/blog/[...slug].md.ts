import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://www.ravewellness.org';

// Markdown representation of every blog post, served alongside the HTML at the
// same slug: /blog/foo.html for browsers, /blog/foo.md for agents.
//
// Why this exists: the site's traffic is overwhelmingly AI retrieval, and making
// an agent parse the page shell to reach the article is wasted work on both sides.
// Static build, so these are emitted at build time rather than negotiated per
// request. Vercel Edge Middleware can layer `Accept: text/markdown` negotiation
// on top later without changing anything here.

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('blog');
  return posts.map(post => ({ params: { slug: post.id }, props: { post } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: any };
  const d = post.data;

  const fmt = (x: Date | undefined) =>
    x instanceof Date ? x.toISOString().slice(0, 10) : undefined;

  // Rewrite root-relative links to absolute so an agent reading this in
  // isolation can still follow them.
  const body = String(post.body ?? '').replace(
    /\]\((\/[^)]*)\)/g,
    (_m: string, path: string) => `](${SITE}${path})`
  );

  const header = [
    `# ${d.title}`,
    ``,
    d.description ? `> ${d.description}` : null,
    ``,
    `Source: ${SITE}/blog/${post.id}.html`,
    d.author ? `Author: ${d.author}` : null,
    fmt(d.date) ? `Published: ${fmt(d.date)}` : null,
    fmt(d.lastmod) ? `Updated: ${fmt(d.lastmod)}` : null,
    Array.isArray(d.tags) && d.tags.length ? `Tags: ${d.tags.join(', ')}` : null,
    ``,
    `Not medical advice. Harm reduction information for people who have already`,
    `decided to use. In an emergency, call your local emergency number.`,
    `Some links are affiliate links; we may earn a commission at no cost to you.`,
    ``,
    `---`,
    ``,
  ]
    .filter(l => l !== null)
    .join('\n');

  return new Response(header + body.trim() + '\n', {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Vary': 'Accept',
      'X-Robots-Tag': 'index, follow',
    },
  });
};
