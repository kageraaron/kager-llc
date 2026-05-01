/**
 * Server-side Stripe instance. Only import from API routes — the secret key
 * must never reach the browser.
 *
 * If STRIPE_SECRET_KEY is not configured, accessing the exported `stripe`
 * lazily will throw — check `isStripeConfigured()` first when the call site
 * needs to gracefully degrade.
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  return _stripe;
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}
