// Avatars are served by whichever Supabase this build points at.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's1.ticketm.net' },
      { protocol: 'https', hostname: 'media.ticketmaster.com' },
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: '**.supabase.co' },
      ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : []),
    ],
  },
};

module.exports = nextConfig;
