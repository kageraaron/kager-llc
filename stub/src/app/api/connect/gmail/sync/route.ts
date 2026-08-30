import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { encryptToken, decryptToken } from '@/lib/crypto';
import {
  refreshAccessToken,
  buildTicketQuery,
  listMessagePage,
  getMessage,
  getProfile,
  parseGmailMessage,
} from '@/lib/providers/gmail';
import { ingestEmail } from '@/lib/ingest/pipeline';

export const maxDuration = 60;

/**
 * Scan the signed-in user's mailbox right now, instead of waiting for the cron.
 * Deliberately does a full query re-scan rather than an incremental history
 * sync: this button exists because something is missing, and the incremental
 * cursor is exactly what would skip it again.
 *
 * Dedupe on `content_hash` makes re-scanning safe.
 *
 * ## Why this is paginated
 *
 * The lookback window is configurable, up to ten years, and a decade of ticket
 * mail is thousands of messages. Each one costs a Gmail fetch, an extraction,
 * and — when it parses as a ticket — a walk down the provider cascade. That is
 * nowhere near 60 seconds' work, so one request handles ONE page and hands back
 * `nextPageToken`; the client loops. A timeout then costs a page, not the scan.
 *
 * ## What a deep backfill can and cannot find
 *
 * Every provider in the cascade lists shows that are ON SALE. A confirmation
 * from 2021 will parse fine and match nothing, so it lands in the review queue
 * for manual add rather than appearing in the Archive on its own. That is worth
 * knowing before kicking off a ten-year scan and expecting a full history.
 */

/** Messages ingested per request. Sized to finish inside `maxDuration`. */
const PAGE_SIZE = 25;

/**
 * Allowed lookback windows, in days. A closed set rather than a free number:
 * `days` reaches a Gmail query string, and the windows are also what the UI
 * offers, so there is no reason to accept anything else.
 */
const LOOKBACK_DAYS = new Set([30, 365, 730, 1825, 3650]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let days = 30;
  let pageToken: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.days === 'number' && LOOKBACK_DAYS.has(body.days)) days = body.days;
    if (typeof body?.pageToken === 'string' && body.pageToken) pageToken = body.pageToken;
  } catch {
    // Empty POST body: default to the normal 30-day scan, first page.
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from('email_accounts')
    .select('id, email, refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')
    .maybeSingle();

  if (!account?.refresh_token) {
    return NextResponse.json({ error: 'Gmail is not connected' }, { status: 400 });
  }

  try {
    const { access_token, expires_in } = await refreshAccessToken(decryptToken(account.refresh_token));

    const page = await listMessagePage(access_token, buildTicketQuery(days), pageToken, PAGE_SIZE);
    const counts = { scanned: page.ids.length, added: 0, review: 0, skipped: 0, errors: 0 };

    for (const id of page.ids) {
      try {
        const raw = parseGmailMessage(await getMessage(access_token, id));
        const outcome = await ingestEmail(admin, user.id, raw, {
          accountId: account.id,
          source: 'gmail',
        });
        if (outcome.status === 'auto_added') counts.added++;
        else if (outcome.status === 'needs_review') counts.review++;
        else if (outcome.status === 'error') counts.errors++;
        else counts.skipped++;
      } catch {
        counts.errors++;
      }
    }

    /*
     * Only advance the incremental cursor on the LAST page. Moving it early
     * would mark everything up to now as seen while pages of older mail are
     * still unprocessed, and the nightly cron would then never revisit them.
     */
    const done = !page.nextPageToken;
    await admin
      .from('email_accounts')
      .update({
        access_token: encryptToken(access_token),
        token_expires: new Date(Date.now() + expires_in * 1000).toISOString(),
        last_synced_at: new Date().toISOString(),
        ...(done ? { history_id: (await getProfile(access_token)).historyId } : {}),
        status: 'active',
      })
      .eq('id', account.id);

    return NextResponse.json({
      ok: true,
      days,
      nextPageToken: page.nextPageToken,
      done,
      ...counts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|unauthorized/i.test(message)) {
      await admin.from('email_accounts').update({ status: 'needs_reauth' }).eq('id', account.id);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
