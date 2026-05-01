import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/printful/client';

/**
 * GET /api/printful/products
 *
 * Returns a curated subset of Printful's catalog matching wall-print product
 * categories (canvas, poster, framed, metal). Marked-up prices are applied
 * client-side on the variant listing — the catalog itself doesn't include
 * pricing.
 */
export async function GET() {
  try {
    const products = await listProducts();
    const allowed = ['canvas', 'poster', 'framed', 'metal', 'print'];
    const curated = products
      .filter((p) =>
        allowed.some((kw) =>
          `${p.title} ${p.type} ${p.model ?? ''}`.toLowerCase().includes(kw),
        ),
      )
      .slice(0, 24)
      .map((p) => ({
        id: p.id,
        title: p.title,
        brand: p.brand,
        image: p.image,
      }));
    return NextResponse.json({ products: curated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
