import 'server-only';
import type { Db } from '@/lib/db';

/**
 * SerpApi's free plan is 250 searches a month. The cap leaves a little room
 * for "Check price now" taps; SERPAPI_MONTHLY_CAP overrides it on a paid plan.
 */
export const SERPAPI_CAP = Number(process.env.SERPAPI_MONTHLY_CAP) || 240;

/** Rough searches per check: a round trip is 2 (outbound + return), plus 1 for the fare-type lookup when a drop shows. */
export const CALLS_PER_CHECK = { flight: 2.5, hotel: 1, retail: 1 } as const;

export class BudgetExhausted extends Error {
  constructor() {
    super('SerpApi monthly budget used up');
  }
}

/** Take one search from this month's budget, or throw if it's gone. */
export async function claimSerpCall(db: Db): Promise<void> {
  const { data, error } = await db.rpc('claim_api_call', { p_provider: 'serpapi', p_cap: SERPAPI_CAP });
  if (error) throw error;
  if (!data) throw new BudgetExhausted();
}

export async function serpUsage(db: Db): Promise<{ used: number; cap: number }> {
  const month = new Date();
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const { data } = await db.from('api_usage').select('calls').eq('provider', 'serpapi').eq('month', first).maybeSingle();
  return { used: data?.calls ?? 0, cap: SERPAPI_CAP };
}

/**
 * How many days apart checks must be so the rest of the month's budget lasts.
 *
 * `weight` is the searches one round of checks costs across every trip and
 * stay being watched. With 100 searches left, 10 days to go and two round
 * trips (5 per round), checks can run every day; with five trips, every
 * 2.5 days. Never less than 1 day.
 */
export function pacingDays(remaining: number, daysLeftInMonth: number, weight: number): number {
  if (weight <= 0) return 1;
  if (remaining <= 0) return Infinity;
  const perDay = remaining / Math.max(daysLeftInMonth, 1);
  return Math.max(1, weight / perDay);
}
