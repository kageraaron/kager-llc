'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholdId } from '@/lib/household';
import { creditExpiry, creditRuleFor, deadlineFor, policyFor, returnBy, type BestBuyTier } from '@/lib/policies';
import { getSettings, nextCheckAt } from '@/lib/schedule';
import { savePurchase, scanAll } from '@/lib/scan';
import { runChecks } from '@/lib/checks';
import { toCents, type ParsedPurchase } from '@/lib/ingest/extract';

/**
 * Everything the person does by hand. Writes go through the request client so
 * RLS keeps them inside the household; the jobs run with the service role.
 */

async function requireHousehold() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) throw new Error('Not signed in');
  const householdId = await getHouseholdId(supabase, user.id);
  return { supabase, user, householdId };
}

const done = (path = '/') => {
  revalidatePath(path);
  revalidatePath('/');
  revalidatePath('/review');
};

/** A reviewed purchase goes on the watch list, with its deadline recomputed. */
export async function confirmPurchase(id: string) {
  const { supabase, householdId } = await requireHousehold();
  const { data: p } = await supabase.from('purchases').select('*').eq('id', id).single();
  if (!p) return { ok: false as const, error: 'Not found' };
  const policy = policyFor(p.merchant);
  if (!policy) return { ok: false as const, error: 'Unknown merchant' };

  const settings = await getSettings(supabase, householdId);
  const deadline = deadlineFor(policy, new Date(p.purchased_at), p.details, { bestbuyTier: settings.bestbuy_tier });
  const expired = deadline ? deadline <= new Date() : false;
  const { error } = await supabase
    .from('purchases')
    .update({
      status: expired ? 'expired' : 'watching',
      deadline_at: deadline?.toISOString() ?? null,
      return_by: returnBy(policy, new Date(p.purchased_at), { bestbuyTier: settings.bestbuy_tier })?.toISOString() ?? null,
      next_check_at: expired ? null : nextCheckAt(policy, { ...p, deadline_at: deadline?.toISOString() ?? null })?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  done(`/purchases/${id}`);
  return { ok: true as const };
}

export async function dismissPurchase(id: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase
    .from('purchases')
    .update({ status: 'dismissed', next_check_at: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  done(`/purchases/${id}`);
  return { ok: true as const };
}

/**
 * "I claimed it": records what came back. The window stays open, since most
 * policies allow another adjustment if the price drops again, so the purchase
 * keeps being watched against the new, lower price.
 */
export async function markClaimed(id: string, savedDollars: string, asCredit = false) {
  const { supabase, user, householdId } = await requireHousehold();
  const saved = toCents(savedDollars);
  if (!saved) return { ok: false as const, error: 'Enter how much came back' };
  const { data: p } = await supabase
    .from('purchases')
    .select('saved_cents, total_cents, merchant, purchased_at, details')
    .eq('id', id)
    .single();
  if (!p) return { ok: false as const, error: 'Not found' };

  // Airline money usually comes back as a credit with an expiry. Track it so
  // it gets used: the expiry is that airline's usual rule, editable afterwards.
  if (asCredit) {
    const rule = creditRuleFor(p.merchant, (p.details as { fare_brand?: string }).fare_brand);
    await supabase.from('credits').insert({
      household_id: householdId,
      user_id: user.id,
      issuer: p.merchant,
      label: rule?.label ?? `${policyFor(p.merchant)?.name ?? 'Travel'} credit`,
      amount_cents: saved,
      expires_at: rule ? creditExpiry(rule, new Date(p.purchased_at)).toISOString().slice(0, 10) : null,
      rule: rule?.rule ?? 'book_by',
      purchase_id: id,
    });
    revalidatePath('/credits');
  }

  const { error } = await supabase
    .from('purchases')
    .update({
      saved_cents: (p.saved_cents ?? 0) + saved,
      total_cents: p.total_cents ? Math.max(p.total_cents - saved, 0) : p.total_cents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  done(`/purchases/${id}`);
  return { ok: true as const };
}

/** Fix what the parser got wrong before confirming: total, fare type, refundable. */
export async function editPurchase(
  id: string,
  input: { total?: string; fareBrand?: string; refundable?: boolean; purchasedAt?: string },
) {
  const { supabase } = await requireHousehold();
  const { data: p } = await supabase.from('purchases').select('details').eq('id', id).single();
  if (!p) return { ok: false as const, error: 'Not found' };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.total !== undefined) patch.total_cents = toCents(input.total) ?? null;
  if (input.purchasedAt) patch.purchased_at = new Date(input.purchasedAt).toISOString();
  const details = { ...(p.details as object) } as Record<string, unknown>;
  if (input.fareBrand !== undefined) details.fare_brand = input.fareBrand || undefined;
  if (input.refundable !== undefined) details.refundable = input.refundable;
  patch.details = details;

  const { error } = await supabase.from('purchases').update(patch).eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  done(`/purchases/${id}`);
  return { ok: true as const };
}

/** A purchase Gmail didn't catch: in a store, or from an email Refund couldn't read. */
export async function addPurchase(input: {
  merchant: string;
  orderRef?: string;
  purchasedAt: string;
  total?: string;
  itemTitle?: string;
  sku?: string;
  // flights
  from?: string;
  to?: string;
  flights?: string;
  departs?: string;
  returnDeparts?: string;
  returnFlights?: string;
  fareBrand?: string;
  passengers?: string;
  // hotels
  property?: string;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  refundable?: boolean;
}) {
  const { user, householdId } = await requireHousehold();
  const policy = policyFor(input.merchant);
  if (!policy) return { ok: false as const, error: 'Pick a merchant' };
  if (!input.purchasedAt) return { ok: false as const, error: 'When did you buy it?' };

  const legs = (flights: string | undefined, from?: string, to?: string, departs?: string) =>
    (flights ?? '')
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((f, i, all) => ({
        carrier: f.match(/^[A-Z0-9]{2}/i)?.[0].toUpperCase(),
        flight: f.replace(/^[A-Z0-9]{2}/i, ''),
        // Only the first and last airports are known when typed by hand.
        from: i === 0 ? from?.toUpperCase() : undefined,
        to: i === all.length - 1 ? to?.toUpperCase() : undefined,
        departs: i === 0 && departs ? new Date(departs).toISOString() : undefined,
      }));

  const details: Record<string, unknown> =
    policy.kind === 'flight'
      ? {
          segments: [
            ...legs(input.flights, input.from, input.to, input.departs),
            ...legs(input.returnFlights, input.to, input.from, input.returnDeparts),
          ],
          passengers: Number(input.passengers) || 1,
          fare_brand: input.fareBrand || undefined,
        }
      : policy.kind === 'hotel'
        ? { property: input.property, city: input.city, check_in: input.checkIn, check_out: input.checkOut, refundable: input.refundable }
        : {};

  const parsed: ParsedPurchase = {
    kind: policy.kind,
    merchant: policy.id,
    merchantName: policy.kind === 'hotel' && input.property ? input.property : policy.name,
    orderRef: input.orderRef?.trim() || undefined,
    purchasedAt: new Date(input.purchasedAt).toISOString(),
    totalCents: toCents(input.total),
    currency: 'USD',
    items: input.itemTitle
      ? [{ title: input.itemTitle, sku: input.sku?.trim() || undefined, quantity: 1, unitPriceCents: toCents(input.total) }]
      : [],
    details,
    confidence: 'high',
  };

  try {
    const id = await savePurchase(createAdminClient(), policy, parsed, {
      userId: user.id,
      householdId,
      messageId: null,
      source: 'manual',
    });
    done();
    return { ok: true as const, id };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Could not save' };
  }
}

export async function updateSettings(input: {
  bestbuyTier: BestBuyTier;
  storeMin: string;
  flightMin: string;
  minPct: string;
}) {
  const { supabase, householdId } = await requireHousehold();
  const { error } = await supabase.from('settings').upsert({
    household_id: householdId,
    bestbuy_tier: input.bestbuyTier,
    store_min_cents: toCents(input.storeMin) ?? 1000,
    flight_min_cents: toCents(input.flightMin) ?? 3000,
    min_pct: Math.min(Math.max(Number(input.minPct) || 5, 0), 50),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/settings');
  return { ok: true as const };
}

/** "Scan now" and "Check now": the jobs, on demand, bounded. */
export async function scanNow() {
  await requireHousehold();
  const result = await scanAll(createAdminClient(), { maxPerAccount: 150 });
  done();
  return { ok: true as const, ...result };
}

export async function checkNow(id: string) {
  const { supabase } = await requireHousehold();
  // Make it due, then run the job for just the due set.
  const { error } = await supabase.from('purchases').update({ next_check_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  const result = await runChecks(createAdminClient(), { limit: 5 });
  done(`/purchases/${id}`);
  return { ok: true as const, ...result };
}

// ------------------------------------------------------------------ credits

/** A credit Refund didn't create: a voucher from a cancelled trip, a gift, a goodwill credit. */
export async function addCredit(input: { label: string; amount?: string; expiresAt?: string; rule?: 'book_by' | 'travel_by'; code?: string; notes?: string }) {
  const { supabase, user, householdId } = await requireHousehold();
  if (!input.label?.trim()) return { ok: false as const, error: 'What is the credit?' };
  const { error } = await supabase.from('credits').insert({
    household_id: householdId,
    user_id: user.id,
    issuer: input.label.trim().split(/\s+/)[0].toLowerCase(),
    label: input.label.trim().slice(0, 120),
    amount_cents: toCents(input.amount) ?? null,
    expires_at: input.expiresAt || null,
    rule: input.rule ?? 'book_by',
    code: input.code?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/credits');
  return { ok: true as const };
}

export async function setCreditStatus(id: string, status: 'active' | 'used') {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.from('credits').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/credits');
  return { ok: true as const };
}

export async function updateCreditExpiry(id: string, expiresAt: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.from('credits').update({ expires_at: expiresAt || null, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/credits');
  return { ok: true as const };
}
