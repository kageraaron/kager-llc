import { NextRequest, NextResponse } from 'next/server';
import { getBlueprint, listPrintProviders } from '@/lib/printify/client';

/**
 * GET /api/printify/blueprints/:id
 *
 * Returns blueprint details + the list of print providers that can fulfill it.
 * The first provider is usually the cheapest / fastest; UI defaults to that.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Invalid blueprint id' }, { status: 400 });
  }
  try {
    const [blueprint, providers] = await Promise.all([
      getBlueprint(id),
      listPrintProviders(id),
    ]);
    return NextResponse.json({ blueprint, providers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
