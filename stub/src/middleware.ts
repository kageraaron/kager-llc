import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
    pathname.startsWith('/api/ingest') ||
    // Calendar clients cannot carry a session; the feed's token IS its
    // credential, and the route validates it with the service role.
    pathname.startsWith('/api/calendar');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/' || pathname.startsWith('/login'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/upcoming';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
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
