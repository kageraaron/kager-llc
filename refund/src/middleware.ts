import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions } from '@/lib/supabase/cookies';

/**
 * Refreshes the Supabase session cookie on every navigation and gates the app.
 * Same shape as Stub's, including its two proxy fixes: redirects are built on
 * NEXT_PUBLIC_SITE_URL (behind Caddy, `nextUrl` is https://localhost:3002),
 * and the guarded page's query rides inside `next`.
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
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/api/cron');

  if (!user && !isPublic) {
    const url = publicUrl(request);
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (user && pathname.startsWith('/login')) {
    const url = publicUrl(request);
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

function publicUrl(request: NextRequest) {
  const url = request.nextUrl.clone();
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    const base = new URL(site);
    url.protocol = base.protocol;
    url.hostname = base.hostname;
    url.port = base.port;
  }
  return url;
}

export const config = {
  // sw.js and the manifest must load signed out, or the PWA can't install.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)'],
};
