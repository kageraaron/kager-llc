import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken, decryptToken } from '@/lib/crypto';
import {
  refreshAccessToken,
  buildTicketQuery,
  listMessageIds,
  listHistorySince,
  getMessage,
  getProfile,
  parseGmailMessage,
} from '@/lib/providers/gmail';
import { ingestEmail } from '@/lib/ingest/pipeline';

/**
 * Scheduled Gmail scan. Runs every 30 minutes (see vercel.json crons).
 *
 * First sync for an account: query the last 30 days for ticket-shaped mail.
 * After that: incremental via Gmail's history API, falling back to a full
 * re-scan when the stored historyId has aged out (Gmail keeps roughly a week).
 */

export const maxDuration = 60;

/** Cap per run so one account cannot exhaust the whole function budget. */
const MAX_MESSAGES_PER_ACCOUNT = 40;

export async function GET(request: NextRequest) {
  // Vercel Cron sends this header; reject anything else so the endpoint is not
  // an open trigger for other people's mailbox scans.
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: accounts, error } = await admin
    .from('email_accounts')
    .select('id, user_id, email, refresh_token, history_id')
    .eq('provider', 'gmail')
    .eq('status', 'active');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary: Record<string, unknown>[] = [];

  for (const account of accounts ?? []) {
    try {
      if (!account.refresh_token) {
        await admin.from('email_accounts').update({ status: 'needs_reauth' }).eq('id', account.id);
        continue;
      }

      const { access_token, expires_in } = await refreshAccessToken(
        decryptToken(account.refresh_token),
      );

      let messageIds: string[] = [];
      let nextHistoryId: string | null = null;

      if (account.history_id) {
        const history = await listHistorySince(access_token, account.history_id);
        if (history.expired) {
          // Cursor too old: fall back to a bounded full re-scan.
          messageIds = await listMessageIds(access_token, buildTicketQuery(30), MAX_MESSAGES_PER_ACCOUNT);
          nextHistoryId = (await getProfile(access_token)).historyId;
        } else {
          messageIds = history.ids.slice(0, MAX_MESSAGES_PER_ACCOUNT);
          nextHistoryId = history.historyId;
        }
      } else {
        // First run: 30-day backfill, same window Shop uses for packages.
        messageIds = await listMessageIds(access_token, buildTicketQuery(30), MAX_MESSAGES_PER_ACCOUNT);
        nextHistoryId = (await getProfile(access_token)).historyId;
      }

      const counts = { added: 0, review: 0, skipped: 0, errors: 0 };

      for (const id of messageIds) {
        try {
          const raw = parseGmailMessage(await getMessage(access_token, id));
          const outcome = await ingestEmail(admin, account.user_id, raw, {
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

      await admin
        .from('email_accounts')
        .update({
          access_token: encryptToken(access_token),
          token_expires: new Date(Date.now() + expires_in * 1000).toISOString(),
          history_id: nextHistoryId ?? account.history_id,
          last_synced_at: new Date().toISOString(),
          status: 'active',
        })
        .eq('id', account.id);

      summary.push({ email: account.email, scanned: messageIds.length, ...counts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A revoked grant shows up as invalid_grant; flag it so the UI can prompt
      // a reconnect instead of retrying forever.
      const status = /invalid_grant|unauthorized/i.test(message) ? 'needs_reauth' : 'error';
      await admin.from('email_accounts').update({ status }).eq('id', account.id);
      summary.push({ email: account.email, error: message });
    }
  }

  return NextResponse.json({ ok: true, accounts: summary.length, summary });
}
