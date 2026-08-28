import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { encryptToken, decryptToken } from '@/lib/crypto';
import {
  refreshAccessToken,
  buildTicketQuery,
  listMessageIds,
  getMessage,
  getProfile,
  parseGmailMessage,
} from '@/lib/providers/gmail';
import { ingestEmail } from '@/lib/ingest/pipeline';

export const maxDuration = 60;

/**
 * Scan the signed-in user's mailbox right now, instead of waiting up to 30
 * minutes for the cron. Deliberately does a full query re-scan rather than an
 * incremental history sync: this button exists because something is missing,
 * and the incremental cursor is exactly what would skip it again.
 *
 * Dedupe on `content_hash` makes re-scanning safe.
 */
export async function POST() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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

    const ids = await listMessageIds(access_token, buildTicketQuery(30), 60);
    const counts = { scanned: ids.length, added: 0, review: 0, skipped: 0, errors: 0 };

    for (const id of ids) {
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

    await admin
      .from('email_accounts')
      .update({
        access_token: encryptToken(access_token),
        token_expires: new Date(Date.now() + expires_in * 1000).toISOString(),
        last_synced_at: new Date().toISOString(),
        history_id: (await getProfile(access_token)).historyId,
        status: 'active',
      })
      .eq('id', account.id);

    return NextResponse.json({ ok: true, ...counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|unauthorized/i.test(message)) {
      await admin.from('email_accounts').update({ status: 'needs_reauth' }).eq('id', account.id);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
