import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshExploreArtists } from '@/lib/explore';

/**
 * Daily Explore refresh: ask Ticketmaster about the artists households follow
 * or have seen, stalest first. See `lib/explore.ts`.
 *
 * 150 artists a run, each re-checked after 3 days, is at most ~300 calls a day
 * against Ticketmaster's 5,000.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Fails closed — see the note in `cron/gmail-sync`.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.TICKETMASTER_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'TICKETMASTER_API_KEY not set' });
  }

  const result = await refreshExploreArtists(createAdminClient(), { maxArtists: 150, staleDays: 3 });
  return NextResponse.json({ ok: true, ...result });
}
