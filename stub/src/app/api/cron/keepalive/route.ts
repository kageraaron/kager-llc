import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Keeps the Supabase project out of the free tier's idle pause.
 *
 * A free project pauses after roughly 7 days with no activity, and the first
 * person back then hits a dead app rather than a slow one — restoring is a
 * manual click in the dashboard. A periodic write is the cheapest insurance.
 *
 * ## Why this exists when `gmail-sync` already runs every 30 minutes
 *
 * That job queries the database, so in the normal case it already keeps the
 * project awake. But it only touches Supabase for accounts that are connected
 * and active — an app with no connected mailbox does no database work at all —
 * and it is exactly the kind of job that gets disabled while debugging. This
 * one has no other reason to fail: no third-party API, no per-user state, one
 * upsert. If the project ever pauses anyway, the row's timestamp says when the
 * keep-alive last actually ran.
 *
 * A WRITE rather than a read, deliberately: unambiguous activity, and it leaves
 * evidence.
 *
 * Scheduled from `.github/workflows/stub-cron.yml` rather than `vercel.json` —
 * Vercel's Hobby plan caps cron jobs at two, and both slots are already spoken
 * for by gmail-sync and reminders.
 */

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Fails closed, like the other cron routes: an unset secret must lock the
  // endpoint rather than open it.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const beatAt = new Date().toISOString();

  const { error } = await admin
    .from('service_heartbeat')
    .upsert({ id: 'keepalive', beat_at: beatAt, note: 'cron' }, { onConflict: 'id' });

  if (error) {
    console.error('keepalive failed', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, beat_at: beatAt });
}
