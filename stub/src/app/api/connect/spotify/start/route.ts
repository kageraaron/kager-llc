import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { authorizeUrl } from '@/lib/providers/spotify';

export async function GET() {
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${site}/login`);

  if (!process.env.SPOTIFY_CLIENT_ID) {
    return NextResponse.redirect(`${site}/settings/connections?error=spotify_not_configured`);
  }

  // CSRF state, bound to the session via an httpOnly cookie.
  const nonce = randomBytes(16).toString('hex');
  const response = NextResponse.redirect(
    authorizeUrl(nonce, `${site}/api/connect/spotify/callback`),
  );
  response.cookies.set('spotify_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
