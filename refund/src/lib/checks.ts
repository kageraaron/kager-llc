import 'server-only';
import type { Db as SupabaseClient } from '@/lib/db';
import { fareClaimable, policyFor, worthAlerting } from '@/lib/policies';
import { getSettings, nextCheckAt } from '@/lib/schedule';
import { bestBuyPrices } from '@/lib/pricing/bestbuy';
import { quoteFlights, quoteHotel, splitLegs, type Segment } from '@/lib/pricing/serpapi';
import { notifyOnce } from '@/lib/push';
import { formatMoney } from '@/lib/format';

/**
 * The scheduled job: price checks, drop alerts, deadline reminders, expiry.
 *
 * An alert needs all of: the same item / flights + fare type / property, a
 * drop clearing both the flat and percentage floors, a claimable fare, and a
 * drop at least $15 (stores $5) below the last price already alerted on, so a
 * price bouncing around doesn't re-notify.
 */

const DAY = 86_400_000;

interface PurchaseRow {
  id: string;
  household_id: string;
  kind: 'retail' | 'flight' | 'hotel';
  merchant: string;
  merchant_name: string | null;
  purchased_at: string;
  deadline_at: string | null;
  total_cents: number | null;
  details: Record<string, unknown>;
}

export interface CheckResult {
  checked: number;
  alerts: number;
  reminders: number;
  expired: number;
  errors: number;
}

export async function runChecks(admin: SupabaseClient, opts: { limit?: number } = {}): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, alerts: 0, reminders: 0, expired: 0, errors: 0 };
  const now = new Date();

  // 1. Close windows that have passed.
  const { data: closed } = await admin
    .from('purchases')
    .update({ status: 'expired', next_check_at: null, updated_at: now.toISOString() })
    .eq('status', 'watching')
    .lt('deadline_at', now.toISOString())
    .select('id');
  result.expired = closed?.length ?? 0;

  // 2. Price checks that are due.
  const { data: due } = await admin
    .from('purchases')
    .select('id, household_id, kind, merchant, merchant_name, purchased_at, deadline_at, total_cents, details')
    .eq('status', 'watching')
    .lte('next_check_at', now.toISOString())
    .order('next_check_at', { ascending: true })
    .limit(opts.limit ?? 50);

  for (const p of (due ?? []) as PurchaseRow[]) {
    try {
      const alerted = await checkOne(admin, p);
      result.checked++;
      if (alerted) result.alerts++;
    } catch (err) {
      result.errors++;
      console.error('refund check failed', { purchase: p.id, err: err instanceof Error ? err.message : err });
    }
    const policy = policyFor(p.merchant);
    const next = policy ? nextCheckAt(policy, p) : null;
    await admin.from('purchases').update({ next_check_at: next?.toISOString() ?? null }).eq('id', p.id);
  }

  // 3. Reminders for windows Refund can't price-check, and "closing soon" for all.
  result.reminders = await sendReminders(admin, now);
  return result;
}

async function checkOne(admin: SupabaseClient, p: PurchaseRow): Promise<boolean> {
  const policy = policyFor(p.merchant);
  if (!policy?.priceSource) return false;
  // No key yet: skip quietly rather than log a "not found" that isn't true.
  const keyed = policy.priceSource === 'bestbuy' ? !!process.env.BESTBUY_API_KEY : !!process.env.SERPAPI_KEY;
  if (!keyed) return false;
  const settings = await getSettings(admin, p.household_id);
  const log = (row: { item_id?: string; price_cents?: number; matched: boolean; note?: string }) =>
    admin.from('price_checks').insert({ purchase_id: p.id, household_id: p.household_id, source: policy.priceSource, ...row });

  // ---- Best Buy: per item, by SKU.
  if (policy.priceSource === 'bestbuy') {
    const { data: items } = await admin.from('items').select('id, title, sku, unit_price_cents, quantity').eq('purchase_id', p.id);
    const withSku = (items ?? []).filter((i) => i.sku && i.unit_price_cents);
    if (!withSku.length) return false;
    const prices = await bestBuyPrices(withSku.map((i) => i.sku!));
    let alerted = false;
    for (const item of withSku) {
      const now = prices.get(item.sku!);
      await log({ item_id: item.id, price_cents: now?.salePriceCents, matched: !!now, note: now ? undefined : 'SKU not found' });
      if (!now) continue;
      await admin.from('items').update({ last_price_cents: now.salePriceCents, last_checked_at: new Date().toISOString() }).eq('id', item.id);
      if (!worthAlerting('retail', item.unit_price_cents!, now.salePriceCents, settings)) continue;
      const saved = (item.unit_price_cents! - now.salePriceCents) * (item.quantity ?? 1);
      alerted =
        (await alertDrop(admin, p, now.salePriceCents, saved, 500, {
          title: `${item.title.slice(0, 40)} dropped ${formatMoney(saved)}`,
          body: `Best Buy now has it for ${formatMoney(now.salePriceCents)}. Claim before ${deadlineText(p)}.`,
        })) || alerted;
    }
    return alerted;
  }

  if (!p.total_cents) return false;

  // ---- Flights: same flights, same fare type.
  if (policy.priceSource === 'serpapi_flights') {
    const d = p.details as { segments?: Segment[]; passengers?: number; fare_brand?: string };
    const claimable = fareClaimable(policy, d, new Date(p.purchased_at));
    const quote = await quoteFlights(d.segments ?? [], { passengers: d.passengers ?? 1, fareBrand: d.fare_brand, paidCents: p.total_cents });
    await log({ price_cents: quote.totalCents, matched: quote.matched, note: quote.note });
    if (!quote.matched || quote.totalCents == null || !claimable.ok) return false;
    if (!worthAlerting('flight', p.total_cents, quote.totalCents, settings)) return false;
    const saved = p.total_cents - quote.totalCents;
    const { out } = splitLegs(d.segments ?? []);
    const route = `${out[0]?.from ?? ''}→${out[out.length - 1]?.to ?? ''}`;
    return alertDrop(admin, p, quote.totalCents, saved, 1500, {
      title: `${route} dropped about ${formatMoney(saved)}`,
      body: `${policy.name} now ${formatMoney(quote.totalCents)} for your flights (${quote.note ?? 'same fare'}). Comes back as: ${policy.comesBackAs}.`,
    });
  }

  // ---- Hotels: same property and dates, refundable only.
  if (policy.priceSource === 'serpapi_hotels') {
    const d = p.details as { property?: string; city?: string; check_in?: string; check_out?: string; refundable?: boolean };
    if (!d.property || !d.check_in || !d.check_out || d.refundable === false) return false;
    const quote = await quoteHotel({ property: d.property, city: d.city, check_in: d.check_in, check_out: d.check_out });
    await log({ price_cents: quote.totalCents, matched: quote.matched, note: quote.note });
    if (!quote.matched || quote.totalCents == null) return false;
    if (!worthAlerting('flight', p.total_cents, quote.totalCents, settings)) return false;
    const saved = p.total_cents - quote.totalCents;
    return alertDrop(admin, p, quote.totalCents, saved, 1500, {
      title: `${d.property.slice(0, 40)} is about ${formatMoney(saved)} cheaper`,
      body: `Lowest rate now ${formatMoney(quote.totalCents)}. Check it's the same room, rebook, then cancel before ${deadlineText(p)}.`,
    });
  }
  return false;
}

/** Push once per new low: a later alert needs to beat the last one by `stepCents`. */
async function alertDrop(
  admin: SupabaseClient,
  p: PurchaseRow,
  nowCents: number,
  _savedCents: number,
  stepCents: number,
  msg: { title: string; body: string },
): Promise<boolean> {
  const { data: prior } = await admin.from('notifications').select('key').eq('purchase_id', p.id).like('key', 'drop:%');
  const lastLow = Math.min(...(prior ?? []).map((n) => Number(n.key.slice(5))).filter(Number.isFinite), Infinity);
  if (nowCents > lastLow - stepCents) return false;
  // Round to the dollar so the same price can't produce two keys.
  const key = `drop:${Math.round(nowCents / 100) * 100}`;
  return notifyOnce(admin, { purchaseId: p.id, householdId: p.household_id, key }, { ...msg, url: `/purchases/${p.id}` });
}

const deadlineText = (p: PurchaseRow) =>
  p.deadline_at ? new Date(p.deadline_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'the deadline';

async function sendReminders(admin: SupabaseClient, now: Date): Promise<number> {
  const { data: open } = await admin
    .from('purchases')
    .select('id, household_id, kind, merchant, merchant_name, purchased_at, deadline_at, total_cents, details')
    .eq('status', 'watching')
    .not('deadline_at', 'is', null)
    .gt('deadline_at', now.toISOString());

  let sent = 0;
  for (const p of (open ?? []) as PurchaseRow[]) {
    const policy = policyFor(p.merchant);
    if (!policy) continue;
    const age = (now.getTime() - new Date(p.purchased_at).getTime()) / DAY;
    const left = (new Date(p.deadline_at!).getTime() - now.getTime()) / DAY;
    const name = p.merchant_name ?? policy.name;

    // Stores Refund can't price-check: one nudge partway through the window.
    if (!policy.priceSource && policy.remindOnDay && age >= policy.remindOnDay && left > 0) {
      if (await notifyOnce(admin, { purchaseId: p.id, householdId: p.household_id, key: 'remind:check' }, {
        title: `Check your ${name} order`,
        body: `If the price dropped, ${name} pays the difference. ${Math.ceil(left)} day${Math.ceil(left) === 1 ? '' : 's'} left.`,
        url: `/purchases/${p.id}`,
      })) sent++;
    }
    // Retail windows closing within 2 days.
    if (p.kind === 'retail' && left <= 2 && left > 0) {
      if (await notifyOnce(admin, { purchaseId: p.id, householdId: p.household_id, key: 'remind:closing' }, {
        title: `${name} price-match window closes ${left < 1 ? 'today' : 'in 2 days'}`,
        body: 'Last chance to check for a lower price.',
        url: `/purchases/${p.id}`,
      })) sent++;
    }
  }
  return sent;
}
