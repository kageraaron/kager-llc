import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions } from '@/lib/supabase/cookies';

/**
 * Refreshes the Supabase session cookie on every navigation and gates the app
 * routes. Server Components cannot write cookies, so the refresh has to happen
 * here or sessions silently expire mid-session.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/cron') ||
    // Calendar clients cannot carry a session; the feed's token IS its
    // credential, and the route validates it with the service role.
    pathname.startsWith('/api/calendar') ||
    // Same for the TRMNL display feed, which TRMNL's servers poll. Without this
    // the gate 307s them to /login and the plugin renders the login page's HTML
    // instead of the feed — a failure that looks like a broken template rather
    // than an auth redirect.
    pathname.startsWith('/api/trmnl');

  if (!user && !isPublic) {
    const url = publicUrl(request);
    url.pathname = '/login';
    // The query belongs to the page being guarded, not to /login: carry it
    // inside `next` so it survives sign-in (e.g. Explore's ?near=).
    url.search = '';
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/' || pathname.startsWith('/login'))) {
    const url = publicUrl(request);
    url.pathname = '/upcoming';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * `request.nextUrl` rebased onto the public site URL.
 *
 * Behind a reverse proxy (Caddy on the home server) the standalone server sees
 * its own bind address, so `nextUrl` comes out as https://localhost:3001 and a
 * redirect built from it sends the browser nowhere. NEXT_PUBLIC_SITE_URL is the
 * address people actually use.
 */
function publicUrl(request: NextRequest) {
  const url = request.nextUrl.clone();
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    const base = new URL(site);
    url.protocol = base.protocol;
    url.hostname = base.hostname;
    // NextURL keeps the port apart from the host, so it must be reset too.
    url.port = base.port;
  }
  return url;
}

export const config = {
  /*
   * `sw.js` MUST be excluded.
   *
   * The service worker is fetched by the browser without credentials, so the
   * session cookie is absent and the auth gate below 307s it to /login. A
   * service worker script that answers with a redirect fails registration
   * outright — the spec rejects it — which silently kills the PWA: no install,
   * no offline shell, and an already-installed app left on a stale worker.
   *
   * Same reasoning as the other static assets here: none of them are routes,
   * and none of them can carry a session.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)'],
};
