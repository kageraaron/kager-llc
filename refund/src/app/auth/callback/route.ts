import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** Exchanges the OAuth code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Not `nextUrl.origin`: behind Caddy that's the container's own address.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
