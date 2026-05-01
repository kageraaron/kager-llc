import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl, getStripe, isStripeConfigured } from '@/lib/stripe/client';

export const runtime = 'nodejs';

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for a single Printful print order.
 * The order details (variant, file, recipient) ride along in session
 * metadata; the webhook handler reads them after payment and submits the
 * fulfillment to Printful.
 *
 * Body:
 *   {
 *     productTitle: string,
 *     variantTitle: string,
 *     amountCents: number,        // marked-up customer price
 *     printfulVariantId: number,
 *     printfulFileId: number,
 *     recipient: PrintfulRecipient,
 *   }
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local.' },
      { status: 501 },
    );
  }

  let body: {
    productTitle?: string;
    variantTitle?: string;
    amountCents?: number;
    printfulVariantId?: number;
    printfulFileId?: number;
    recipient?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !body.productTitle ||
    !body.variantTitle ||
    !body.amountCents ||
    !body.printfulVariantId ||
    !body.printfulFileId ||
    !body.recipient
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Stripe metadata values are capped at 500 chars each. The recipient JSON
  // for a typical address fits comfortably; if you ever need more, persist
  // the order in a real KV/DB and only put the order id in metadata.
  const recipientJson = JSON.stringify(body.recipient);
  if (recipientJson.length > 480) {
    return NextResponse.json(
      { error: 'Recipient payload too large for Stripe metadata' },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripe();
    const site = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: body.amountCents,
            product_data: {
              name: `${body.productTitle} — ${body.variantTitle}`,
              description: 'PrintPerfect.ai print order, fulfilled by Printful.',
            },
          },
        },
      ],
      // Capture the recipient email separately too (Stripe surfaces it to the seller dashboard).
      customer_email:
        typeof body.recipient.email === 'string' ? body.recipient.email : undefined,
      metadata: {
        supplier: 'printful',
        variant_id: String(body.printfulVariantId),
        file_id: String(body.printfulFileId),
        recipient: recipientJson,
      },
      success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/checkout/cancel`,
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stripe error' },
      { status: 500 },
    );
  }
}
