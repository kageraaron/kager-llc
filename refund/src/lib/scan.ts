import 'server-only';
import type { Db as SupabaseClient } from '@/lib/db';
import { decryptToken } from '@/lib/crypto';
import { buildPurchaseQuery, getMessage, listMessageIds, parseGmailMessage, refreshAccessToken } from '@/lib/providers/gmail';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { emailRole, extractPurchase, type ParsedPurchase } from '@/lib/ingest/extract';
import { deadlineFor, policyForSender, returnBy, type Policy } from '@/lib/policies';
import { getSettings, nextCheckAt } from '@/lib/schedule';
import { getHouseholdId } from '@/lib/household';

/**
 * Read new order and booking emails from every connected Gmail account.
 *
 * The accounts are Stub's (public.email_accounts): one connection serves the
 * suite. Refund keeps its own list of messages it has seen (refund.messages)
 * instead of sharing Stub's history cursor, so neither app moves the other's
 * place. A first scan reaches back ~11 months for travel; after that each run
 * looks at the last 3 days and skips anything already seen.
 */

const BACKFILL_DAYS = 330;
const RECENT_DAYS = 3;

export interface ScanResult {
  accounts: number;
  read: number;
  purchases: number;
  review: number;
  errors: number;
}

export async function scanAll(admin: SupabaseClient, opts: { maxPerAccount?: number } = {}): Promise<ScanResult> {
  const result: ScanResult = { accounts: 0, read: 0, purchases: 0, review: 0, errors: 0 };

  const { data: accounts, error } = await admin
    .schema('public')
    .from('email_accounts')
    .select('id, user_id, refresh_token')
    .eq('provider', 'gmail')
    .eq('status', 'active');
  if (error) throw error;

  for (const account of accounts ?? []) {
    if (!account.refresh_token) continue;
    result.accounts++;
    try {
      const householdId = await getHouseholdId(admin, account.user_id);
      const { access_token } = await refreshAccessToken(decryptToken(account.refresh_token));

      const { count } = await admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('email_account_id', account.id);
      const firstScan = !count;

      const ids = await listMessageIds(
        access_token,
        buildPurchaseQuery(firstScan ? BACKFILL_DAYS : RECENT_DAYS),
        opts.maxPerAccount ?? (firstScan ? 400 : 100),
      );

      // Skip what's already been read.
      const seen = new Set<string>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await admin
          .from('messages')
          .select('gmail_id')
          .eq('email_account_id', account.id)
          .in('gmail_id', ids.slice(i, i + 100));
        for (const r of data ?? []) seen.add(r.gmail_id);
      }

      for (const id of ids.filter((x) => !seen.has(x))) {
        result.read++;
        const outcome = await ingestOne(admin, { accountId: account.id, userId: account.user_id, householdId }, access_token, id);
        if (outcome === 'purchase') result.purchases++;
        else if (outcome === 'review') result.review++;
        else if (outcome === 'error') result.errors++;
      }
    } catch (err) {
      result.errors++;
      console.error('refund scan failed for account', { account: account.id, err: err instanceof Error ? err.message : err });
    }
  }
  return result;
}

async function ingestOne(
  admin: SupabaseClient,
  who: { accountId: string; userId: string; householdId: string },
  token: string,
  gmailId: string,
): Promise<'purchase' | 'review' | 'ignored' | 'error'> {
  const record = (status: string, extra: Record<string, unknown> = {}) =>
    admin
      .from('messages')
      .upsert(
        { email_account_id: who.accountId, household_id: who.householdId, gmail_id: gmailId, status, ...extra },
        { onConflict: 'email_account_id,gmail_id' },
      )
      .select('id')
      .single();

  try {
    const email = normalizeEmail(parseGmailMessage(await getMessage(token, gmailId)));
    const meta = { received_at: email.receivedAt, from_addr: email.from.slice(0, 300), subject: email.subject.slice(0, 300) };

    const policy = policyForSender(email.from);
    const role = emailRole(email.subject);
    const parsed = policy && role !== 'other' ? extractPurchase(email, policy) : null;
    if (!policy || !parsed) {
      // Not a purchase: keep only the Gmail id (so it isn't read again), never
      // the sender or subject. Bodies are never stored for any message.
      await record('ignored', { received_at: email.receivedAt });
      return 'ignored';
    }

    // Only a confirmation or receipt creates a purchase; reminders and
    // shipping mail just fill gaps on one that already exists.
    const status = parsed.confidence === 'high' ? 'purchase' : 'review';
    const { data: msg } = await record(role === 'purchase' ? status : 'ignored', role === 'purchase' ? meta : { received_at: email.receivedAt });
    const saved = await savePurchase(admin, policy, parsed, {
      ...who,
      messageId: msg?.id ?? null,
      source: 'gmail',
      createIfMissing: role === 'purchase',
    });
    return saved && role === 'purchase' ? status : 'ignored';
  } catch (err) {
    await record('error', { error: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
    return 'error';
  }
}

/**
 * Write a parsed purchase, or update the one already there for this order.
 *
 * A shipping or "your trip is coming up" email for a known order carries the
 * same order number; it may add items or a total the first email lacked, but
 * never resets what the person has already decided (claimed / dismissed).
 */
export async function savePurchase(
  admin: SupabaseClient,
  policy: Policy,
  parsed: ParsedPurchase,
  who: { userId: string; householdId: string; messageId: string | null; source: 'gmail' | 'manual'; createIfMissing?: boolean },
): Promise<string | null> {
  const settings = await getSettings(admin, who.householdId);
  const purchasedAt = new Date(parsed.purchasedAt);
  const deadline = deadlineFor(policy, purchasedAt, parsed.details, { bestbuyTier: settings.bestbuy_tier });
  const expired = deadline ? deadline <= new Date() : false;

  const existing = parsed.orderRef
    ? (
        await admin
          .from('purchases')
          .select('id, status, total_cents, details')
          .eq('household_id', who.householdId)
          .eq('merchant', policy.id)
          .eq('order_ref', parsed.orderRef)
          .maybeSingle()
      ).data
    : null;

  const status = expired ? 'expired' : parsed.confidence === 'high' ? 'watching' : 'review';
  const row = {
    household_id: who.householdId,
    user_id: who.userId,
    kind: parsed.kind,
    merchant: policy.id,
    merchant_name: parsed.merchantName,
    order_ref: parsed.orderRef ?? null,
    purchased_at: purchasedAt.toISOString(),
    total_cents: parsed.totalCents ?? null,
    currency: parsed.currency,
    deadline_at: deadline?.toISOString() ?? null,
    return_by: returnBy(policy, purchasedAt, { bestbuyTier: settings.bestbuy_tier })?.toISOString() ?? null,
    details: parsed.details,
    source: who.source,
    message_id: who.messageId,
  };

  let purchaseId: string;
  if (!existing && who.createIfMissing === false) return null;
  if (existing) {
    purchaseId = existing.id;
    const decided = ['claimed', 'dismissed'].includes(existing.status);
    // Fill gaps only: a later email never overwrites a known total.
    await admin
      .from('purchases')
      .update({
        total_cents: existing.total_cents ?? row.total_cents,
        details: { ...row.details, ...(existing.details as object) },
        deadline_at: row.deadline_at,
        return_by: row.return_by,
        ...(decided || existing.status === 'watching' ? {} : { status }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    const { data, error } = await admin
      .from('purchases')
      .insert({
        ...row,
        status,
        next_check_at: nextCheckAt(policy, { purchased_at: row.purchased_at, deadline_at: row.deadline_at, details: row.details })?.toISOString() ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    purchaseId = data.id;
  }

  if (parsed.items.length) {
    const { data: have } = await admin.from('items').select('sku, title').eq('purchase_id', purchaseId);
    const known = new Set((have ?? []).map((i) => i.sku ?? i.title));
    const fresh = parsed.items.filter((i) => !known.has(i.sku ?? i.title));
    if (fresh.length) {
      await admin.from('items').insert(
        fresh.map((i) => ({
          purchase_id: purchaseId,
          household_id: who.householdId,
          title: i.title.slice(0, 300),
          sku: i.sku ?? null,
          url: i.url ?? null,
          quantity: i.quantity,
          unit_price_cents: i.unitPriceCents ?? null,
        })),
      );
    }
  }
  return purchaseId;
}
