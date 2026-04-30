import { NextResponse } from 'next/server';
import { listBlueprints } from '@/lib/printify/client';

/**
 * GET /api/printify/products
 *
 * Returns a curated list of print blueprints (canvas, framed, poster) suitable
 * for the editor's "Order as print" flow. Filtered & shaped to keep the client
 * payload small.
 */
export async function GET() {
  try {
    const blueprints = await listBlueprints();
    const allowed = ['canvas', 'poster', 'framed', 'metal'];
    const curated = blueprints
      .filter((b) =>
        allowed.some((kw) => `${b.title} ${b.model ?? ''}`.toLowerCase().includes(kw)),
      )
      .slice(0, 24)
      .map((b) => ({
        id: b.id,
        title: b.title,
        brand: b.brand,
        image: b.images?.[0] ?? null,
      }));
    return NextResponse.json({ products: curated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
