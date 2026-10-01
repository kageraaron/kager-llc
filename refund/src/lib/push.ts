import 'server-only';
import webpush from 'web-push';
import type { Db as SupabaseClient } from '@/lib/db';
import { getHouseholdUserIds } from '@/lib/household';

function configured(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT ?? 'mailto:noreply@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

/**
 * Send once per (purchase, key) to everyone in the household.
 *
 * The notification row is claimed BEFORE sending: its unique key is the
 * dedupe, and a concurrent run loses the insert and sends nothing. Pushing
 * first and recording after would double-send whenever the write failed.
 */
export async function notifyOnce(
  admin: SupabaseClient,
  target: { purchaseId: string; householdId: string; key: string },
  message: { title: string; body: string; url: string },
): Promise<boolean> {
  const { error: claimed } = await admin
    .from('notifications')
    .insert({ purchase_id: target.purchaseId, household_id: target.householdId, key: target.key });
  if (claimed) return false;
  if (!configured()) return false;

  const users = await getHouseholdUserIds(admin, target.householdId);
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', users);

  const payload = JSON.stringify(message);
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
      else console.error('refund push failed', err);
    }
  }
  return true;
}
