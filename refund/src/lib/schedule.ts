import type { Db as SupabaseClient } from '@/lib/db';
import { DEFAULT_SETTINGS, fareClaimable, type BestBuyTier, type Policy } from '@/lib/policies';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface HouseholdSettings {
  bestbuy_tier: BestBuyTier;
  store_min_cents: number;
  flight_min_cents: number;
  min_pct: number;
}

export async function getSettings(db: SupabaseClient, householdId: string): Promise<HouseholdSettings> {
  const { data } = await db.from('settings').select('*').eq('household_id', householdId).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as HouseholdSettings;
}

/**
 * When to look at this purchase's price next, or null for never.
 *
 * Daily for as long as a drop could still be claimed: flights until departure,
 * refundable hotels until the cancellation deadline, Best Buy until its window
 * closes. Plus a check ~20 hours after a flight is booked, inside the DOT
 * 24-hour window when even Basic fares can be cancelled.
 *
 * `paceDays` stretches that when SerpApi's monthly budget can't cover a daily
 * check of everything (see budget.ts); trips more than 90 days out stretch
 * twice as much, since fares that far out move slowly. Never checked: stores
 * with no sanctioned price source (they get reminders), non-refundable hotels,
 * and Basic fares past their 24 hours, which can't be claimed whatever the price.
 */
export function nextCheckAt(
  policy: Policy,
  purchase: { purchased_at: string; deadline_at: string | null; details: Record<string, unknown> },
  now = new Date(),
  paceDays = 1,
): Date | null {
  if (!policy.priceSource) return null;
  if (purchase.deadline_at && new Date(purchase.deadline_at) <= now) return null;
  if (policy.kind === 'hotel' && purchase.details.refundable === false) return null;
  if (!Number.isFinite(paceDays)) return startOfNextMonth(now);

  if (policy.kind === 'flight') {
    const bought = new Date(purchase.purchased_at);
    const bookedAgo = now.getTime() - bought.getTime();
    if (bookedAgo < 20 * HOUR) return new Date(bought.getTime() + 20 * HOUR);
    const later = new Date(now.getTime() + DAY);
    if (!fareClaimable(policy, purchase.details, bought, later).ok) return null;
    const departs = purchase.deadline_at ? new Date(purchase.deadline_at).getTime() : Infinity;
    const daysOut = (departs - now.getTime()) / DAY;
    const days = daysOut > 90 ? paceDays * 2 : paceDays;
    // Never schedule past the deadline: one last look the day before.
    return new Date(Math.min(now.getTime() + days * DAY, departs - DAY / 2));
  }
  const days = policy.priceSource === 'bestbuy' ? 1 : paceDays;
  return new Date(now.getTime() + days * DAY);
}

function startOfNextMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 6));
}
