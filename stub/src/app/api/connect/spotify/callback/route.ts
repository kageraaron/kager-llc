import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, getFollowedArtists, getTopArtists } from '@/lib/providers/spotify';
import { resolveMbid } from '@/lib/providers/musicbrainz';

export const maxDuration = 60;

/**
 * Imports followed + top artists as favorites.
 *
 * Reminder: Spotify caps development-mode apps at five authorized users, so the
 * token exchange is where a sixth person fails. That error is surfaced verbatim
 * rather than swallowed, because "nothing happened" would be baffling.
 */
export async function GET(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const cookieState = request.cookies.get('spotify_state')?.value;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !code || !state || state !== cookieState) {
    return NextResponse.redirect(`${site}/settings/connections?error=invalid_callback`);
  }

  let tokens;
  try {
    tokens = await exchangeCode(code, `${site}/api/connect/spotify/callback`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'spotify_failed';
    return NextResponse.redirect(
      `${site}/settings/connections?error=${encodeURIComponent(message.slice(0, 160))}`,
    );
  }

  const [followed, top] = await Promise.all([
    getFollowedArtists(tokens.access_token).catch(() => []),
    getTopArtists(tokens.access_token).catch(() => []),
  ]);

  const admin = createAdminClient();
  const seen = new Set<string>();
  let imported = 0;

  for (const artist of [...followed, ...top]) {
    if (seen.has(artist.id)) continue;
    seen.add(artist.id);

    // MusicBrainz is rate limited to 1 req/s, so cap how many we resolve per run.
    const mbid = imported < 40 ? await resolveMbid(artist.name) : null;

    const { data: row } = await admin
      .from('artists')
      .upsert(
        {
          ...(mbid ? { mbid } : {}),
          name: artist.name,
          image_url: artist.images?.[0]?.url ?? null,
          genres: artist.genres ?? [],
        },
        { onConflict: mbid ? 'mbid' : 'tm_id', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (!row) continue;

    await admin.from('user_artists').upsert(
      { user_id: user.id, artist_id: row.id, source: 'spotify', weight: 1 },
      { onConflict: 'user_id,artist_id,source' },
    );
    imported++;
  }

  const response = NextResponse.redirect(
    `${site}/settings/connections?connected=spotify&artists=${imported}`,
  );
  response.cookies.delete('spotify_state');
  return response;
}
