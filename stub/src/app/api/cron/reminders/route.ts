import { NextResponse, type NextRequest } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatEventTime } from '@/lib/format';

/**
 * Day-before show reminders.
 *
 * Runs hourly. Finds attendances whose event starts in the next 24-48 hours,
 * skips anyone already reminded (via `sent_reminders`), and pushes once.
 *
 * On iOS, web push only reaches users who added Stub to their home screen
 * (iOS 16.4+); browser-tab visitors will simply have no subscription stored.
 */

export const maxDuration = 60;

function configureWebPush(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;

  webpush.setVapidDetails(
    VAPID_SUBJECT ?? 'mailto:noreply@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  return true;
}

export async function GET(request: NextRequest) {
  // Fails closed — see the note in `cron/gmail-sync`. An unset secret must lock
  // the endpoint, not open it.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!configureWebPush()) {
    return NextResponse.json({ ok: false, reason: 'VAPID keys not configured' });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const from = new Date(now + 24 * 3600_000).toISOString();
  const to = new Date(now + 48 * 3600_000).toISOString();

  const { data: rows, error } = await admin
    .from('attendances')
    .select(`
      user_id,
      event:events!inner (
        id, name, starts_at, timezone,
        venue:venues ( name, city ),
        headliner:artists!events_headliner_id_fkey ( name )
      )
    `)
    .eq('state', 'going')
    .gte('events.starts_at', from)
    .lte('events.starts_at', to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    user_id: string;
    event: {
      id: string;
      name: string;
      starts_at: string;
      timezone: string | null;
      venue: { name: string; city: string | null } | null;
      headliner: { name: string } | null;
    };
  };

  let sent = 0;
  let skipped = 0;
  let pruned = 0;

  for (const row of (rows ?? []) as unknown as Row[]) {
    // Idempotency: the insert fails if this reminder already went out.
    const { error: dupe } = await admin
      .from('sent_reminders')
      .insert({ user_id: row.user_id, event_id: row.event.id, kind: 'day_before' });
    if (dupe) { skipped++; continue; }

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', row.user_id);

    const title = row.event.headliner?.name ?? row.event.name;
    const payload = JSON.stringify({
      title: `${title} is tomorrow`,
      body: [
        formatEventTime(row.event.starts_at, row.event.timezone),
        row.event.venue?.name,
      ].filter(Boolean).join(' · '),
      url: `/event/${row.event.id}`,
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        // 404/410 means the subscription is dead — drop it rather than retrying forever.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          pruned++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, pruned });
}
