import { NextRequest, NextResponse } from 'next/server';
import { createOrder } from '@/lib/printful/client';
import type { PrintfulOrderRequest } from '@/lib/printful/types';

export const runtime = 'nodejs';

/**
 * POST /api/printful/order
 *
 * Creates a Printful order. Defaults to **draft** mode (no charge); pass
 * `?confirm=true` in the URL to immediately charge and submit for fulfillment.
 *
 * IMPORTANT: until a customer-facing payment processor (Stripe etc.) is
 * wired in, only submit drafts. Confirming a draft will charge the
 * merchant account at the base wholesale price without having captured
 * the marked-up customer payment first.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const confirm = url.searchParams.get('confirm') === 'true';
  try {
    const body = (await req.json()) as PrintfulOrderRequest;
    if (!body.items?.length) {
      return NextResponse.json({ error: 'No items' }, { status: 400 });
    }
    if (!body.recipient) {
      return NextResponse.json({ error: 'No recipient' }, { status: 400 });
    }
    const result = await createOrder(body, confirm);
    return NextResponse.json({ ok: true, order: result, confirmed: confirm });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Order submission failed' },
      { status: 500 },
    );
  }
}
