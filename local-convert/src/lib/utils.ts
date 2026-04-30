export function parseSlug(slug: string): { from: string; to: string } | null {
  const parts = slug.split('-to-');
  if (parts.length !== 2) return null;
  return { from: parts[0].toUpperCase(), to: parts[1].toUpperCase() };
}

export function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}
