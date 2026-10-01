/**
 * The suite's shared session cookie.
 *
 * Stub and Refund sign in against the same Supabase, so one session can serve
 * both: a cookie on the parent domain (e.g. `.example.org`) reaches every
 * app's subdomain. It has its
 * own NAME on purpose. Before this, each app kept a host-only cookie under
 * Supabase's default name; a domain cookie with that same name would be sent
 * alongside the old one and the two would fight. A new name sidesteps that
 * entirely, at the cost of one more sign-in per app when this ships.
 *
 * Unset COOKIE_DOMAIN (local dev) falls back to Supabase's defaults.
 */
export const cookieOptions = process.env.NEXT_PUBLIC_COOKIE_DOMAIN
  ? { name: process.env.NEXT_PUBLIC_COOKIE_NAME || 'sb-suite', domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN }
  : undefined;
