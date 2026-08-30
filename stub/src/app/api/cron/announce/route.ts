import { NextResponse, type NextRequest } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { eventZone, formatEventDate } from '@/lib/format';

/**
 * "An artist you follow just announced a show."
 *
 * Bandsintown's entire product, and the one notification a concert app is
 * expected to send. The pieces already existed separately — `user_artists`
 * holds follows, `push_subscriptions` holds devices, `sent_reminders` dedupes —
 * and this joins them.
 *
 * ## It announces from the local catalog, not from a provider sweep
 *
 * The obvious design is a nightly query per followed artist against
 * Ticketmaster. This does not do that, for two reasons:
 *
 *  - The catalog is shared. Every event any user's ingestion or Browse has ever
 *    surfaced is already in `events` with its provider ids — so an artist's new
 *    date usually arrives on its own, at zero additional provider cost.
 *  - A per-artist sweep is the expensive path, and the two providers that are
 *    best at the small rooms people actually follow are the two that are
 *    metered hardest.
 *
 * The trade-off is real and worth stating: **an artist nobody has searched for
 * will not announce.** Adding a bounded Ticketmaster refresh for followed
 * artists is the natural next step — it is effectively free at 5,000/day — and
 * it slots in ahead of the diff below without changing anything else here.
 *
 * ## What it will not send
 *
 *  - A show the user is already going to or interested in. They know.
 *  - A show already announced, via `sent_reminders` with `kind = 'announce'`.
 *  - Anything in the past, or further out than a year — a festival dated
 *    fourteen months ahead is not news.
 */

export const maxDuration = 60;

/** Push payloads per run, so one popular announcement cannot exhaust the budget. */
const MAX_PUSHES = 200;

/** Beyond this the show is too far out to be worth waking someone for. */
const HORIZON_DAYS = 365;

function configureWebPush(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;

  /*
   * A real `mailto:` matters. Apple's push service rejects a placeholder
   * subject outright, so an unset VAPID_SUBJECT means iOS pushes fail while
   * every other platform succeeds — a failure that looks like a device bug.
   */
  webpush.setVapidDetails(
    VAPID_SUBJECT ?? 'mailto:noreply@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  return true;
}

interface FollowRow {
  user_id: string;
  artist_id: string;
}

interface EventRow {
  id: string;
  name: string;
  starts_at: string;
  timezone: string | null;
  headliner_id: string | null;
  venue: {
    name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    timezone: string | null;
  } | null;
  headliner: { name: string } | null;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!configureWebPush()) {
    return NextResponse.json({ error: 'VAPID keys are not set' }, { status: 503 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  const { data: follows, error: followErr } = await admin
    .from('user_artists')
    .select('user_id, artist_id');
  if (followErr) return NextResponse.json({ error: followErr.message }, { status: 500 });

  const rows = (follows ?? []) as FollowRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, sent: 0, reason: 'nobody follows anyone' });

  // artist -> the users following them, so each event is considered once.
  const followersOf = new Map<string, string[]>();
  for (const r of rows) {
    followersOf.set(r.artist_id, [...(followersOf.get(r.artist_id) ?? []), r.user_id]);
  }

  const { data: events, error: eventErr } = await admin
    .from('events')
    .select(`
      id, name, starts_at, timezone, headliner_id,
      venue:venues ( name, city, region, country, timezone ),
      headliner:artists!events_headliner_id_fkey ( name )
    `)
    .in('headliner_id', [...followersOf.keys()])
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon.toISOString());

  if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 });

  const counts = { candidates: 0, sent: 0, skipped: 0, pruned: 0, errors: 0 };

  for (const event of (events ?? []) as unknown as EventRow[]) {
    const followers = event.headliner_id ? followersOf.get(event.headliner_id) ?? [] : [];
    if (followers.length === 0) continue;

    for (const userId of followers) {
      if (counts.sent >= MAX_PUSHES) break;
      counts.candidates++;

      // Already going, or already told. Either way this is not news.
      const [{ data: attending }, { count: alreadySent }] = await Promise.all([
        admin
          .from('attendances')
          .select('id')
          .eq('user_id', userId)
          .eq('event_id', event.id)
          .maybeSingle(),
        admin
          .from('sent_reminders')
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('event_id', event.id)
          .eq('kind', 'announce'),
      ]);

      if (attending || (alreadySent ?? 0) > 0) {
        counts.skipped++;
        continue;
      }

      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (!subs?.length) {
        counts.skipped++;
        continue;
      }

      /*
       * Claim the send BEFORE pushing. The insert is the dedupe, and its
       * primary key makes it atomic — a concurrent run loses the race and skips
       * rather than double-notifying. Pushing first and recording after would
       * send twice whenever the write failed.
       */
      const { error: claimErr } = await admin
        .from('sent_reminders')
        .insert({ user_id: userId, event_id: event.id, kind: 'announce' });
      if (claimErr) {
        counts.skipped++;
        continue;
      }

      const artist = event.headliner?.name ?? event.name;
      const where = event.venue?.name ?? event.venue?.city ?? null;
      const payload = JSON.stringify({
        title: `${artist} just announced a show`,
        body: [formatEventDate(event.starts_at, eventZone(event)), where]
          .filter(Boolean)
          .join(' · '),
        url: `/event/${event.id}`,
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          counts.sent++;
        } catch (err) {
          // 404/410 means the browser threw the subscription away; so should we.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id);
            counts.pruned++;
          } else {
            counts.errors++;
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...counts });
}
