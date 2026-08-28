import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GMAIL_SCOPES } from '@/lib/providers/gmail';

/**
 * Starts the Gmail connect flow.
 *
 * This is a SEPARATE OAuth grant from sign-in: signing in with Google asks only
 * for identity, while this asks for gmail.readonly. Keeping them apart means a
 * user can use the app without ever granting mailbox access.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL));

  // Fail loudly on missing config. Without this the URL below gets
  // `client_id=undefined` and Google answers with a bare `401 invalid_client`,
  // which looks like a broken OAuth client rather than an unset env var.
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/settings/connections?error=${encodeURIComponent(
        'GOOGLE_OAUTH_CLIENT_ID is not set on the server',
      )}`,
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/connect/gmail/callback`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_OAUTH_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_SCOPES);
  // offline + consent is what actually returns a refresh token; without it the
  // cron poller has no way to act once the first access token expires.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', user.id);

  return NextResponse.redirect(url.toString());
}
