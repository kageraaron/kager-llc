import type { Db as SupabaseClient } from '@/lib/db';
import { DEFAULT_SETTINGS, type BestBuyTier, type Policy } from '@/lib/policies';

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
 * Flights follow the plan's cadence: every 3 days more than 90 days out (fares
 * move slowly and each check costs a SerpApi search), daily inside 90, plus a
 * check ~20 hours after booking while the 24-hour free-cancel window is open.
 * Best Buy and refundable hotels are daily. Stores with no sanctioned price
 * source are never checked; they get reminders instead.
 */
export function nextCheckAt(
  policy: Policy,
  purchase: { purchased_at: string; deadline_at: string | null; details: Record<string, unknown> },
  now = new Date(),
): Date | null {
  if (!policy.priceSource) return null;
  if (purchase.deadline_at && new Date(purchase.deadline_at) <= now) return null;
  if (policy.kind === 'hotel' && purchase.details.refundable === false) return null;

  if (policy.kind === 'flight') {
    const bookedAgo = now.getTime() - new Date(purchase.purchased_at).getTime();
    if (bookedAgo < 20 * HOUR) return new Date(new Date(purchase.purchased_at).getTime() + 20 * HOUR);
    const departs = purchase.deadline_at ? new Date(purchase.deadline_at).getTime() : Infinity;
    const daysOut = (departs - now.getTime()) / DAY;
    return new Date(now.getTime() + (daysOut > 90 ? 3 : 1) * DAY);
  }
  return new Date(now.getTime() + DAY);
}
