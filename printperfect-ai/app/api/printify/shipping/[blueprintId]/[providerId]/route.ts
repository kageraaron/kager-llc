import { NextRequest, NextResponse } from 'next/server';
import { getShipping } from '@/lib/printify/client';

/**
 * GET /api/printify/shipping/:blueprintId/:providerId
 *
 * Returns the shipping handling time + cost matrix for a blueprint × provider
 * combination. Used at the review step to surface delivery estimates.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { blueprintId: string; providerId: string } },
) {
  const blueprintId = Number(params.blueprintId);
  const providerId = Number(params.providerId);
  if (!Number.isFinite(blueprintId) || !Number.isFinite(providerId)) {
    return NextResponse.json({ error: 'Invalid ids' }, { status: 400 });
  }
  try {
    const data = await getShipping(blueprintId, providerId);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
