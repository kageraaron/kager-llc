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

export async function scanAll(
  admin: SupabaseClient,
  /** `rereadDays`: read that many days again, including mail already seen, after a reader improves. */
  opts: { maxPerAccount?: number; rereadDays?: number } = {},
): Promise<ScanResult> {
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
        buildPurchaseQuery(opts.rereadDays ?? (firstScan ? BACKFILL_DAYS : RECENT_DAYS)),
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

      // Oldest first, so a booking is created by its ticket and then amended by
      // what came later (a seat purchase, a schedule change, a cancellation),
      // never the other way round. Gmail lists newest first.
      for (const id of ids.filter((x) => opts.rereadDays || !seen.has(x)).reverse()) {
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

    // A cancelled trip: close the purchase it belongs to. Nothing is created.
    if (policy && role === 'cancelled') {
      const ref = parsed?.orderRef;
      if (ref) await closeCancelled(admin, who.householdId, policy.id, ref);
      await record('ignored', { received_at: email.receivedAt });
      return 'ignored';
    }
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
      // A confirmation restates the booking; a schedule change restates the
      // flights; anything else only fills gaps.
      amend: role === 'purchase' ? 'restate' : role === 'schedule' ? 'flights' : 'fill',
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
/**
 * What is known stays; what was missing is filled in. "Missing" includes an
 * empty list: a purchase first read with `segments: []` must be able to gain
 * its flights from a later email, or from a better reader on a re-read.
 */
export function fillGaps(known: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...incoming, ...known };
  for (const [k, v] of Object.entries(known)) {
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty && incoming[k] != null) out[k] = incoming[k];
  }
  // A fuller itinerary replaces a partial one, but only when it contains every
  // flight already known: one email of a booking can list fewer legs than another.
  type Seg = { carrier?: string; flight?: string };
  const have = known.segments as Seg[] | undefined;
  const more = incoming.segments as Seg[] | undefined;
  const id = (x: Seg) => `${x.carrier ?? ''}${x.flight ?? ''}`;
  if (Array.isArray(have) && Array.isArray(more) && more.length > have.length && have.every((h) => more.some((m) => id(m) === id(h)))) {
    out.segments = more;
  }
  return out;
}

/**
 * A newer confirmation of a booking nobody has confirmed yet. What it states
 * replaces what was read before; what it leaves out is kept. One exception:
 * a shorter list of flights that is part of the known one is a layout that
 * shows fewer legs, not a change of plan.
 */
export function restate(known: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...known };
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  type Seg = { carrier?: string; flight?: string };
  const id = (x: Seg) => `${x.carrier ?? ''}${x.flight ?? ''}`;
  const had = known.segments as Seg[] | undefined;
  const now = incoming.segments as Seg[] | undefined;
  if (Array.isArray(had) && Array.isArray(now) && now.length < had.length && now.every((n) => had.some((h) => id(h) === id(n)))) {
    out.segments = had;
  }
  // An award flag is a fact about the ticket; a later email that omits it does not undo it.
  if (known.award && !('award' in incoming)) out.award = known.award;
  return out;
}

/** The trip was cancelled: stop watching it, and say why. A claimed purchase is left alone. */
export async function closeCancelled(admin: SupabaseClient, householdId: string, merchant: string, orderRef: string): Promise<boolean> {
  const { data } = await admin
    .from('purchases')
    .select('id, status, details')
    .eq('household_id', householdId)
    .eq('merchant', merchant)
    .eq('order_ref', orderRef)
    .maybeSingle();
  if (!data || data.status === 'claimed') return false;
  await admin
    .from('purchases')
    .update({
      status: 'dismissed',
      next_check_at: null,
      details: { ...(data.details as object), cancelled: true },
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id);
  return true;
}

export async function savePurchase(
  admin: SupabaseClient,
  policy: Policy,
  parsed: ParsedPurchase,
  who: {
    userId: string;
    householdId: string;
    messageId: string | null;
    source: 'gmail' | 'manual';
    createIfMissing?: boolean;
    amend?: 'fill' | 'restate' | 'flights';
  },
): Promise<string | null> {
  const settings = await getSettings(admin, who.householdId);
  const purchasedAt = new Date(parsed.purchasedAt);
  const deadline = deadlineFor(policy, purchasedAt, parsed.details, { bestbuyTier: settings.bestbuy_tier });
  const expired = deadline ? deadline <= new Date() : false;

  const existing = parsed.orderRef
    ? (
        await admin
          .from('purchases')
          .select('id, status, total_cents, details, purchased_at')
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
    const known = existing.details as Record<string, unknown>;
    const complete = (segs: unknown) =>
      Array.isArray(segs) && segs.length > 0 && (segs as { from?: string; to?: string; departs?: string }[]).every((x) => x.from && x.to && x.departs);

    /*
     * How much a later email may change depends on what it is and on whether
     * a person has looked yet.
     *  - Not yet confirmed by anyone (in Review, or expired there): a confirmation RESTATES
     *    the booking, so a better read replaces a worse one.
     *  - Once someone has confirmed it, later mail only fills gaps...
     *  - ...except a schedule change, which replaces the flights whenever it
     *    reads a complete set: the old ones no longer exist.
     */
    let details = fillGaps(known, row.details);
    let total = existing.total_cents ?? row.total_cents;
    let purchasedAt = existing.purchased_at as string;
    // "Nobody has confirmed it" includes a booking that expired unreviewed:
    // a trip already flown still deserves the right flights on its record.
    if (who.amend === 'restate' && !decided && existing.status !== 'watching') {
      details = restate(known, row.details);
      total = row.total_cents ?? existing.total_cents;
      // The earliest date any confirmation gives is when it was bought.
      if (new Date(row.purchased_at) < new Date(purchasedAt)) purchasedAt = row.purchased_at;
    }
    if (who.amend === 'flights' && !decided && complete(row.details.segments)) {
      details = { ...details, segments: row.details.segments };
    }
    const amended = deadlineFor(policy, new Date(purchasedAt), details, { bestbuyTier: settings.bestbuy_tier });
    const amendedExpired = amended ? amended <= new Date() : false;

    await admin
      .from('purchases')
      .update({
        total_cents: total,
        details,
        purchased_at: purchasedAt,
        deadline_at: amended?.toISOString() ?? null,
        return_by: row.return_by,
        ...(decided || existing.status === 'watching' ? {} : { status: amendedExpired ? 'expired' : status }),
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
