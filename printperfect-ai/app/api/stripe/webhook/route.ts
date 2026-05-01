import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { createOrder } from '@/lib/printful/client';
import type { PrintfulRecipient } from '@/lib/printful/types';

export const runtime = 'nodejs';

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe events. The one we care about is
 * `checkout.session.completed`: at that point the customer has paid, so we
 * submit the corresponding Printful order with `confirm=true` (which charges
 * the merchant account at wholesale).
 *
 * Webhook signing secret is required — Stripe will reject the route if
 * STRIPE_WEBHOOK_SECRET isn't set. Configure it via `stripe listen` in dev
 * or in the Stripe dashboard for production.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured' },
      { status: 501 },
    );
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  // We need the raw body for signature verification.
  const raw = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : err}` },
      { status: 400 },
    );
  }

  if (event.type !== 'checkout.session.completed') {
    // Acknowledge other events without processing them.
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const md = session.metadata ?? {};
  if (md.supplier !== 'printful') {
    return NextResponse.json({ received: true, ignored: 'non-printful order' });
  }

  const variantId = Number(md.variant_id);
  const fileId = Number(md.file_id);
  let recipient: PrintfulRecipient;
  try {
    recipient = JSON.parse(md.recipient ?? '{}');
  } catch {
    console.error('[stripe webhook] invalid recipient metadata', md.recipient);
    return NextResponse.json({ error: 'Invalid recipient metadata' }, { status: 500 });
  }

  if (!variantId || !fileId || !recipient.email) {
    console.error('[stripe webhook] missing fields', md);
    return NextResponse.json({ error: 'Missing order fields' }, { status: 500 });
  }

  try {
    const order = await createOrder(
      {
        external_id: `pp_stripe_${session.id}`,
        recipient,
        items: [
          {
            variant_id: variantId,
            quantity: 1,
            files: [{ id: fileId, type: 'default' }],
          },
        ],
      },
      true, // confirm: actually submit for fulfillment
    );
    return NextResponse.json({ received: true, order });
  } catch (err) {
    console.error('[stripe webhook] printful submission failed', err);
    // Return 500 so Stripe retries the webhook (transient errors recover).
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Printful order failed' },
      { status: 500 },
    );
  }
}
