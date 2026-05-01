/**
 * Customer-facing markup applied to Printful's wholesale prices.
 *
 * Printful charges the *merchant* (us) at the base price when an order is
 * placed. To capture margin, we display a marked-up price to the customer
 * and (eventually) collect that amount via our own checkout (Stripe, etc.)
 * before submitting the order to Printful.
 *
 * NOTE: Until a payment processor is wired in, the markup is informational
 * only — orders submitted directly will charge the merchant account at the
 * base price with no customer payment captured. See README "TODO: take 20%
 * of orders".
 */

/** Default markup factor (20%). Override with NEXT_PUBLIC_PRINTFUL_MARKUP. */
const DEFAULT_MARKUP = 0.2;

export function getMarkupFactor(): number {
  if (typeof process === 'undefined') return DEFAULT_MARKUP;
  const env = process.env.NEXT_PUBLIC_PRINTFUL_MARKUP;
  if (!env) return DEFAULT_MARKUP;
  const parsed = Number(env);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MARKUP;
  return parsed;
}

/** Apply markup to a USD price (number, dollars). */
export function withMarkup(basePrice: number): number {
  return Math.round(basePrice * (1 + getMarkupFactor()) * 100) / 100;
}

/** Apply markup to a Printful-style string price ("12.95"). Returns dollars. */
export function withMarkupFromString(basePriceStr: string): number {
  const base = Number(basePriceStr);
  if (!Number.isFinite(base)) return 0;
  return withMarkup(base);
}
