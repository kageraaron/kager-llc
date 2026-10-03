import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildPurchaseQuery, getMessage, listMessageIds, parseGmailMessage, refreshAccessToken } from '@/lib/providers/gmail';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { htmlToText } from '@/lib/ingest/html';
import { emailRole, extractPurchase } from '@/lib/ingest/extract';
import { policyForSender } from '@/lib/policies';

export const dynamic = 'force-dynamic';
export const maxDuration = 3000;

/**
 * What does Refund read, and what does it miss? READ-ONLY: nothing is written.
 *
 *   GET /api/cron/extract-report?days=330
 *
 * For each merchant: how many emails are confirmations, how many of those are
 * read fully (structured markup), read thinly (order number or total only, so
 * the purchase lands in Review with nothing to price-check), or not at all.
 * For the thin and unread ones it also reports what the body offers a reader
 * that does not depend on markup: flight numbers, airport pairs, stay dates.
 *
 * Only mail from the covered merchants is described, and only confirmations
 * get their subject listed (digits masked).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days')) || 330, 1), 2000);
  const max = Math.min(Number(request.nextUrl.searchParams.get('max')) || 600, 1500);

  const admin = createAdminClient();
  const { data: accounts } = await admin
    .schema('public')
    .from('email_accounts')
    .select('id, refresh_token')
    .eq('provider', 'gmail')
    .eq('status', 'active');

  type Tally = { mail: number; other: number; update: number; confirmations: number; full: number; thin: number; unread: number };
  const byMerchant: Record<string, Tally> = {};
  const rows: Record<string, unknown>[] = [];
  let read = 0;
  let errors = 0;

  for (const account of accounts ?? []) {
    if (!account.refresh_token) continue;
    const { access_token } = await refreshAccessToken(decryptToken(account.refresh_token));
    const ids = await listMessageIds(access_token, buildPurchaseQuery(days), max);

    for (const id of ids) {
      try {
        const email = normalizeEmail(parseGmailMessage(await getMessage(access_token, id)));
        read++;
        const policy = policyForSender(email.from);
        if (!policy) continue;
        const t = (byMerchant[policy.id] ??= { mail: 0, other: 0, update: 0, confirmations: 0, full: 0, thin: 0, unread: 0 });
        t.mail++;
        const role = emailRole(email.subject);
        if (role !== 'purchase') {
          t[role === 'other' ? 'other' : 'update']++;
          continue;
        }
        t.confirmations++;
        const parsed = extractPurchase(email, policy);
        const kind = !parsed ? 'unread' : parsed.confidence === 'high' ? 'full' : 'thin';
        t[kind]++;
        if (kind === 'full') continue;

        // What a markup-free reader would have to work with.
        const text = `${email.html ? htmlToText(email.html) : ''}\n${email.text}`;
        const flights = [...new Set(text.match(/\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b/g) ?? [])].slice(0, 8);
        const airports = [...new Set(text.match(/\b[A-Z]{3}\b(?=\s*(?:[-–→>]|to\b)\s*[A-Z]{3}\b)|(?<=\b[A-Z]{3}\s*(?:[-–→>]|to)\s*)[A-Z]{3}\b/g) ?? [])].slice(0, 8);
        rows.push({
          date: email.receivedAt.slice(0, 10),
          merchant: policy.id,
          kind: policy.kind,
          read: kind,
          subject: email.subject.replace(/\d{4,}/g, '#').replace(/\b[A-Z0-9]{6}\b/g, '#').slice(0, 80),
          hasJsonLd: /application\/ld\+json/i.test(email.html),
          hasHtml: !!email.html,
          textChars: text.length,
          flightNumbers: policy.kind === 'flight' ? flights : undefined,
          airportPairs: policy.kind === 'flight' ? airports : undefined,
          stayLabels: policy.kind === 'hotel' ? /check[- ]?in/i.test(text) && /check[- ]?out/i.test(text) : undefined,
          total: parsed?.totalCents != null,
          stay:
            policy.kind === 'hotel' && parsed
              ? `${parsed.merchantName} | ${parsed.details.check_in ?? '?'} to ${parsed.details.check_out ?? '?'} | ${parsed.totalCents != null ? `${(parsed.totalCents / 100).toFixed(2)} ${parsed.currency}` : 'no total'} | refundable=${parsed.details.refundable ?? '?'} | cancel by ${parsed.details.cancel_by ?? '?'} | ref=${parsed.orderRef ? 'yes' : 'no'}`
              : undefined,
          award: (parsed?.details as { award?: boolean } | undefined)?.award === true,
          segments: ((parsed?.details as { segments?: { carrier?: string; flight?: string; from?: string; to?: string; departs?: string }[] } | undefined)?.segments ?? []).map(
            (s) => `${s.carrier ?? ''}${s.flight ?? ''} ${s.from ?? '?'}-${s.to ?? '?'} ${s.departs?.slice(0, 16) ?? '?'}`,
          ),
        });
      } catch (err) {
        errors++;
        console.error('extract-report: message failed', err instanceof Error ? err.message.slice(0, 160) : err);
      }
    }
  }

  return NextResponse.json({ days, read, errors, byMerchant, rows });
}
