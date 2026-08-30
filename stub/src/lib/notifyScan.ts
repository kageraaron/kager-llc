import 'server-only';
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * "Your inbox scan found something."
 *
 * The scan runs every 30 minutes and finds nothing almost every time, so this
 * is deliberately hard to trigger: it fires only when a run **added** a show or
 * queued one **to review**, never on a quiet pass. A notification that arrives
 * twice an hour saying "nothing happened" is how a user turns notifications off
 * for good.
 *
 * Split out of the cron route so it can be unit-tested without a Gmail account
 * — `shouldNotify` and `scanMessage` are pure.
 */

export interface ScanCounts {
  added: number;
  review: number;
  skipped?: number;
  errors?: number;
}

/** Only a run that produced something a person would want to open. */
export function shouldNotify(counts: ScanCounts): boolean {
  return counts.added > 0 || counts.review > 0;
}

/**
 * What the push says.
 *
 * The two outcomes are genuinely different and the wording has to carry that:
 * an ADDED show is already on the calendar and needs nothing, while a REVIEW
 * item is a question waiting for an answer. Leading with the count that implies
 * an action keeps the notification honest about whether it needs a tap.
 */
export function scanMessage(counts: ScanCounts): { title: string; body: string; url: string } {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  if (counts.review > 0 && counts.added > 0) {
    return {
      title: `${plural(counts.added, 'show')} added`,
      body: `And ${plural(counts.review, 'ticket')} to review.`,
      url: '/inbox',
    };
  }
  if (counts.review > 0) {
    return {
      title: `${plural(counts.review, 'ticket')} to review`,
      body: 'Stub found ticket emails it could not place on its own.',
      url: '/inbox',
    };
  }
  return {
    title: `${plural(counts.added, 'show')} added`,
    body: 'Found in your inbox and added to Upcoming.',
    url: '/upcoming',
  };
}

function configured(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? 'mailto:noreply@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  return true;
}

/**
 * Best-effort. A push failure must never fail the scan that produced it — the
 * tickets are already recorded, and losing them to a notification error would
 * be a far worse outcome than a missed notification.
 */
export async function notifyScanResults(
  db: SupabaseClient,
  userId: string,
  counts: ScanCounts,
): Promise<number> {
  if (!shouldNotify(counts) || !configured()) return 0;

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (!subs?.length) return 0;

  const payload = JSON.stringify(scanMessage(counts));
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      // 404/410: the browser discarded the subscription, so we should too.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('scan notification failed', err);
      }
    }
  }
  return sent;
}
