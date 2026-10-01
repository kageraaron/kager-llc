import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';

/**
 * "Send a test": push to the signed-in person's own devices and report how
 * many accepted it. The only way to know iOS delivery works end to end.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    return NextResponse.json({ error: 'Push is not configured on the server' }, { status: 503 });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user.id);
  const payload = JSON.stringify({ title: 'Refund', body: 'Test notification: alerts are working.', url: '/' });
  let sent = 0;
  const failures: string[] = [];
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      failures.push(String(status ?? 'error'));
    }
  }
  return NextResponse.json({ ok: true, sent, failures });
}
