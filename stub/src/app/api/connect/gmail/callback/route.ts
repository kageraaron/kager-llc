import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken } from '@/lib/crypto';
import { getProfile } from '@/lib/providers/gmail';

export async function GET(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // `state` carries the user id we issued the flow for; a mismatch means the
  // callback is not the one we started.
  if (!user || !code || state !== user.id) {
    return NextResponse.redirect(`${site}/settings/connections?error=invalid_callback`);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${site}/api/connect/gmail/callback`,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${site}/settings/connections?error=token_exchange_failed`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.refresh_token) {
    // Google only returns a refresh token on first consent. Without one the
    // background sync cannot work, so make the user re-consent rather than
    // storing a connection that will quietly stop working in an hour.
    return NextResponse.redirect(`${site}/settings/connections?error=no_refresh_token`);
  }

  const profile = await getProfile(tokens.access_token);
  const admin = createAdminClient();

  const { error } = await admin.from('email_accounts').upsert(
    {
      user_id: user.id,
      provider: 'gmail',
      email: profile.emailAddress,
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      token_expires: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      // Left null so the first sync does a full 30-day backfill rather than an
      // incremental one from a cursor that predates us.
      history_id: null,
      status: 'active',
    },
    { onConflict: 'user_id,provider,email' },
  );

  if (error) {
    return NextResponse.redirect(`${site}/settings/connections?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${site}/settings/connections?connected=1`);
}
