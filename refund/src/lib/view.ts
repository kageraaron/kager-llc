import type { Db as SupabaseClient } from '@/lib/db';
import { splitLegs, type Segment } from '@/lib/pricing/serpapi';

/** What a purchase card needs, gathered in three queries rather than one per card. */
export interface PurchaseView {
  id: string;
  kind: 'retail' | 'flight' | 'hotel';
  merchant: string;
  merchant_name: string | null;
  order_ref: string | null;
  purchased_at: string;
  deadline_at: string | null;
  total_cents: number | null;
  status: string;
  saved_cents: number;
  details: Record<string, unknown>;
  title: string;
  /** Today's comparable price, if Refund has one. */
  nowCents: number | null;
}

export function purchaseTitle(p: { kind: string; merchant_name: string | null; details: Record<string, unknown> }, firstItem?: string): string {
  if (p.kind === 'flight') {
    const { out, back } = splitLegs((p.details.segments as Segment[]) ?? []);
    const a = out[0]?.from;
    const b = out[out.length - 1]?.to;
    if (a && b) return `${a} → ${b}${back.length ? ' round trip' : ''}`;
    return 'Flight';
  }
  if (p.kind === 'hotel') return (p.details.property as string) ?? p.merchant_name ?? 'Hotel stay';
  return firstItem ?? `${p.merchant_name ?? 'Order'}`;
}

export async function loadPurchases(
  db: SupabaseClient,
  filter: { statuses: string[] },
): Promise<PurchaseView[]> {
  const { data: rows } = await db
    .from('purchases')
    .select('id, kind, merchant, merchant_name, order_ref, purchased_at, deadline_at, total_cents, status, saved_cents, details')
    .in('status', filter.statuses)
    .order('deadline_at', { ascending: true, nullsFirst: false });
  const purchases = rows ?? [];
  const ids = purchases.map((p) => p.id);
  if (!ids.length) return [];

  const [{ data: items }, { data: checks }] = await Promise.all([
    db.from('items').select('purchase_id, title, quantity, unit_price_cents, last_price_cents').in('purchase_id', ids),
    db.from('price_checks').select('purchase_id, price_cents, matched, checked_at').in('purchase_id', ids).is('item_id', null).eq('matched', true).order('checked_at', { ascending: false }),
  ]);

  const latest = new Map<string, number>();
  for (const c of checks ?? []) if (c.price_cents != null && !latest.has(c.purchase_id)) latest.set(c.purchase_id, c.price_cents);

  return purchases.map((p) => {
    const its = (items ?? []).filter((i) => i.purchase_id === p.id);
    // Retail: today's price is the item prices summed, when every item has one.
    const retailNow =
      its.length && its.every((i) => i.last_price_cents != null)
        ? its.reduce((s, i) => s + i.last_price_cents! * (i.quantity ?? 1), 0)
        : null;
    const title = purchaseTitle(p, its[0]?.title ? `${its[0].title}${its.length > 1 ? ` + ${its.length - 1} more` : ''}` : undefined);
    return { ...p, title, nowCents: p.kind === 'retail' ? retailNow : latest.get(p.id) ?? null } as PurchaseView;
  });
}
