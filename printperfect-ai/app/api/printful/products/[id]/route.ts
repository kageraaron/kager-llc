import { NextRequest, NextResponse } from 'next/server';
import { getProduct } from '@/lib/printful/client';
import { withMarkupFromString } from '@/lib/printful/markup';

/**
 * GET /api/printful/products/:id
 *
 * Returns variants (sizes, colors) for a Printful product with the customer-
 * facing marked-up price already applied. The base wholesale price is also
 * included so we can debug margin issues if they arise.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  try {
    const detail = await getProduct(id);
    const variants = (detail.variants ?? [])
      .filter((v) => v.in_stock !== false)
      .map((v) => ({
        id: v.id,
        name: v.name,
        size: v.size,
        color: v.color,
        image: v.image,
        basePrice: Number(v.price) || 0,
        price: withMarkupFromString(v.price),
      }));
    return NextResponse.json({ product: detail.product, variants });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
