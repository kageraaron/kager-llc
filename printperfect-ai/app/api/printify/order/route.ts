import { NextRequest, NextResponse } from 'next/server';
import { createOrder } from '@/lib/printify/client';
import type { PrintifyOrderRequest } from '@/lib/printify/types';

export const runtime = 'nodejs';

/**
 * POST /api/printify/order
 *
 * Submits a print order to Printify. The body matches Printify's order shape
 * but with our own `external_id` for reconciliation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PrintifyOrderRequest;
    if (!body.line_items?.length) {
      return NextResponse.json({ error: 'No line items' }, { status: 400 });
    }
    const result = await createOrder(body);
    return NextResponse.json({ ok: true, order: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Order submission failed' },
      { status: 500 },
    );
  }
}
