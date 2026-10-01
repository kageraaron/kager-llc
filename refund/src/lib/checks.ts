import 'server-only';
import type { Db as SupabaseClient } from '@/lib/db';
import { DOT_DELAY_MIN, fareClaimable, owedRefund, policyFor, worthAlerting } from '@/lib/policies';
import { flightStatus } from '@/lib/providers/aerodatabox';
import { cheapestCachedFare } from '@/lib/pricing/travelpayouts';
import { getSettings, nextCheckAt } from '@/lib/schedule';
import { bestBuyPrices } from '@/lib/pricing/bestbuy';
import { quoteFlights, quoteHotel, splitLegs, type Segment } from '@/lib/pricing/serpapi';
import { notifyOnce } from '@/lib/push';
import { formatMoney } from '@/lib/format';
import { BudgetExhausted, CALLS_PER_CHECK, SERPAPI_CAP, pacingDays, serpUsage } from '@/lib/budget';

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
  disruptions?: number;
  creditReminders?: number;
  paceDays?: number | null;
  budgetExhausted?: boolean;
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

  // 2. Pace SerpApi: how far apart checks must be for the month's budget to last.
  const { data: metered } = await admin
    .from('purchases')
    .select('kind')
    .eq('status', 'watching')
    .in('kind', ['flight', 'hotel'])
    .not('next_check_at', 'is', null);
  const weight = (metered ?? []).reduce((s, r) => s + CALLS_PER_CHECK[r.kind as 'flight' | 'hotel'], 0);
  const { used } = await serpUsage(admin);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const paceDays = pacingDays(SERPAPI_CAP - used, (monthEnd.getTime() - now.getTime()) / DAY, weight);
  result.paceDays = Number.isFinite(paceDays) ? Math.round(paceDays * 10) / 10 : null;
  let serpOut = false;

  // 3. Price checks that are due, soonest deadline first so a short budget
  // goes to the trips about to close.
  const { data: due } = await admin
    .from('purchases')
    .select('id, household_id, kind, merchant, merchant_name, purchased_at, deadline_at, total_cents, details')
    .eq('status', 'watching')
    .lte('next_check_at', now.toISOString())
    .order('deadline_at', { ascending: true, nullsFirst: false })
    .limit(opts.limit ?? 50);

  for (const p of (due ?? []) as PurchaseRow[]) {
    const policy = policyFor(p.merchant);
    const metered = policy?.priceSource === 'serpapi_flights' || policy?.priceSource === 'serpapi_hotels';
    // Out of searches this month: leave the rest due; pacing pushes them to next month.
    if (metered && serpOut) continue;
    try {
      const alerted = await checkOne(admin, p);
      result.checked++;
      if (alerted) result.alerts++;
    } catch (err) {
      if (err instanceof BudgetExhausted) {
        serpOut = true;
        result.budgetExhausted = true;
        continue;
      }
      result.errors++;
      console.error('refund check failed', { purchase: p.id, err: err instanceof Error ? err.message : err });
    }
    const next = policy ? nextCheckAt(policy, p, new Date(), metered ? paceDays : 1) : null;
    await admin.from('purchases').update({ next_check_at: next?.toISOString() ?? null }).eq('id', p.id);
  }

  // 4. Reminders for windows Refund can't price-check, and "closing soon" for all.
  result.reminders = await sendReminders(admin, now);
  result.reminders += await remindReturns(admin, now);

  // 5. Flights that just flew: cancelled or late enough to be owed a refund?
  result.disruptions = await checkDisruptions(admin, now).catch((err) => {
    console.error('refund disruption check failed', err instanceof Error ? err.message : err);
    return 0;
  });

  // 6. Travel credits about to lapse.
  result.creditReminders = await remindCredits(admin, now);

  // 7. Belt and braces: mail that wasn't a purchase must carry no sender or
  // subject (the scan no longer writes them; this clears anything older).
  await admin
    .from('messages')
    .update({ subject: null, from_addr: null })
    .in('status', ['ignored', 'error'])
    .not('subject', 'is', null);
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

    // Free pre-check: if the cheapest fare anyone has seen on this route is
    // still above what was paid, the same flights can't be cheaper, so the
    // metered search can wait. The cache can be stale or thin, so a real
    // search still runs at least every 4 days.
    const { legs } = splitLegs(d.segments ?? []);
    const simple = legs.length === 1 || (legs.length === 2 && legs[0][0]?.from === legs[1][legs[1].length - 1]?.to);
    if (simple && process.env.TRAVELPAYOUTS_TOKEN) {
      const { data: lastReal } = await admin
        .from('price_checks')
        .select('checked_at')
        .eq('purchase_id', p.id)
        .eq('source', 'serpapi_flights')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const realIsFresh = lastReal && Date.now() - new Date(lastReal.checked_at).getTime() < 4 * DAY;
      if (realIsFresh) {
        const cached = await cheapestCachedFare({
          from: legs[0][0].from!,
          to: legs[0][legs[0].length - 1].to!,
          departs: legs[0][0].departs!.slice(0, 10),
          returns: legs[1]?.[0]?.departs?.slice(0, 10),
        });
        const cachedTotal = cached != null ? cached * (d.passengers ?? 1) : null;
        if (cachedTotal != null && cachedTotal >= p.total_cents) {
          await admin.from('price_checks').insert({
            purchase_id: p.id,
            household_id: p.household_id,
            source: 'travelpayouts',
            price_cents: cachedTotal,
            matched: false,
            note: 'Cheapest fare seen on this route is above what you paid; skipped the full search',
          });
          return false;
        }
      }
    }

    const quote = await quoteFlights(admin, d.segments ?? [], { passengers: d.passengers ?? 1, fareBrand: d.fare_brand, paidCents: p.total_cents });
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
    const quote = await quoteHotel(admin, { property: d.property, city: d.city, check_in: d.check_in, check_out: d.check_out });
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

// ------------------------------------------------------------------ disruptions

interface FlightRow extends PurchaseRow {
  flight_status: Record<string, { status: string; delay_min: number | null; owed: boolean; checked_at: string }>;
}

/**
 * Ask about each flight once, about five hours after it was due to leave: late
 * enough that a cancellation or a 3-hour delay is on record, early enough that
 * a refund request is still easy. A purchase past its price-drop deadline is
 * still checked here, since the return leg can fly weeks after the outbound.
 */
async function checkDisruptions(admin: SupabaseClient, now: Date): Promise<number> {
  if (!process.env.AERODATABOX_API_KEY) return 0;
  const since = new Date(now.getTime() - 400 * DAY).toISOString();
  const { data: flights } = await admin
    .from('purchases')
    .select('id, household_id, kind, merchant, merchant_name, purchased_at, deadline_at, total_cents, details, flight_status')
    .eq('kind', 'flight')
    .neq('status', 'dismissed')
    .gt('purchased_at', since);

  let alerts = 0;
  for (const p of (flights ?? []) as FlightRow[]) {
    const segments = ((p.details.segments as Segment[]) ?? []).filter((s) => s.departs && (s.flight || s.carrier));
    for (const s of segments) {
      const since = now.getTime() - new Date(s.departs!).getTime();
      if (since < 5 * 3_600_000 || since > 36 * 3_600_000) continue;

      const number = `${s.carrier ?? ''}${s.flight ?? ''}`.replace(/\s+/g, '').toUpperCase().replace(/^([A-Z0-9]{2})\1/, '$1');
      const date = s.departs!.slice(0, 10);
      const key = `${number}@${date}`;
      if (p.flight_status?.[key]) continue;

      const st = await flightStatus(admin, number, date, s.from);
      if (!st) continue;
      const owed = owedRefund(st);
      const next = { ...(p.flight_status ?? {}), [key]: { status: st.status, delay_min: st.delayMin, owed, checked_at: now.toISOString() } };
      p.flight_status = next;
      await admin.from('purchases').update({ flight_status: next }).eq('id', p.id);
      if (!owed) continue;

      const hours = st.delayMin != null ? Math.floor(st.delayMin / 60) : null;
      const floor = (st.international ? DOT_DELAY_MIN.international : DOT_DELAY_MIN.domestic) / 60;
      const sent = await notifyOnce(admin, { purchaseId: p.id, householdId: p.household_id, key: `disrupt:${key}` }, {
        title: st.cancelled ? `${number} was cancelled: you may be owed a refund` : `${number} ran ${hours}h late: you may be owed a refund`,
        body: st.cancelled
          ? 'If you didn’t take the rebooking, the airline owes cash back to your original payment.'
          : `Delays of ${floor}+ hours qualify for a cash refund if you chose not to travel.`,
        url: `/purchases/${p.id}`,
      });
      if (sent) alerts++;
    }
  }
  return alerts;
}

// ------------------------------------------------------------------ credits

/** Expire lapsed credits; remind at 30 and 7 days out. */
async function remindCredits(admin: SupabaseClient, now: Date): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  await admin.from('credits').update({ status: 'expired', updated_at: now.toISOString() }).eq('status', 'active').lt('expires_at', today);

  const { data: credits } = await admin
    .from('credits')
    .select('id, household_id, label, amount_cents, expires_at, rule')
    .eq('status', 'active')
    .not('expires_at', 'is', null);

  let sent = 0;
  for (const c of credits ?? []) {
    const left = Math.ceil((new Date(c.expires_at).getTime() - now.getTime()) / DAY);
    const stage = left <= 7 ? '7' : left <= 30 ? '30' : null;
    if (!stage || left < 0) continue;
    const what = `${c.amount_cents ? `${formatMoney(c.amount_cents)} ` : ''}${c.label}`;
    if (await notifyOnce(admin, { creditId: c.id, householdId: c.household_id, key: `expires:${stage}` }, {
      title: `${what} expires in ${left} day${left === 1 ? '' : 's'}`,
      body: c.rule === 'travel_by' ? 'You have to fly by that date, not just book.' : 'Book a trip with it before then; the flight itself can be later.',
      url: '/credits',
    })) sent++;
  }
  return sent;
}

// ------------------------------------------------------------------ returns

/**
 * One nudge in the last week a store purchase can be returned. Runs for
 * purchases whose price-match window has already closed too (status expired):
 * Target's return window outlasts its price match by 76 days.
 */
async function remindReturns(admin: SupabaseClient, now: Date): Promise<number> {
  const { data: rows } = await admin
    .from('purchases')
    .select('id, household_id, merchant, merchant_name, return_by')
    .eq('kind', 'retail')
    .in('status', ['watching', 'expired'])
    .gt('return_by', now.toISOString())
    .lt('return_by', new Date(now.getTime() + 7 * DAY).toISOString());

  let sent = 0;
  for (const p of rows ?? []) {
    const name = p.merchant_name ?? policyFor(p.merchant)?.name ?? 'the store';
    const left = Math.ceil((new Date(p.return_by).getTime() - now.getTime()) / DAY);
    if (await notifyOnce(admin, { purchaseId: p.id, householdId: p.household_id, key: 'remind:return' }, {
      title: `Last week to return your ${name} order`,
      body: `Returns close in ${left} day${left === 1 ? '' : 's'}. Check the price first: a return and rebuy still works if it dropped.`,
      url: `/purchases/${p.id}`,
    })) sent++;
  }
  return sent;
}
