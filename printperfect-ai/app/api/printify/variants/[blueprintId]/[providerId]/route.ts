import { NextRequest, NextResponse } from 'next/server';
import { listVariants } from '@/lib/printify/client';

/**
 * GET /api/printify/variants/:blueprintId/:providerId
 *
 * Returns the list of variants (size/material/color permutations) a print
 * provider can produce for a blueprint, with per-variant pricing.
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
    const data = await listVariants(blueprintId, providerId);
    // Strip disabled variants and present a small client payload.
    const variants = (data.variants ?? [])
      .filter((v) => v.is_enabled !== false)
      .map((v) => ({
        id: v.id,
        title: v.title,
        options: v.options,
        price: v.price,
      }));
    return NextResponse.json({ variants });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
