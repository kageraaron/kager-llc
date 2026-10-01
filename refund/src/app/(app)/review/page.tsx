import { createClient } from '@/lib/supabase/server';
import { loadPurchases } from '@/lib/view';
import { PurchaseCard } from '@/components/PurchaseCard';

export const dynamic = 'force-dynamic';

/**
 * Purchases read from email without schema.org markup: the order number and
 * total came from text patterns, so a person checks them before Refund starts
 * comparing prices against them.
 */
export default async function ReviewPage() {
  const supabase = await createClient();
  const rows = await loadPurchases(supabase, { statuses: ['review'] });
  return (
    <main className="page">
      <header className="page-header">
        <h1>Review</h1>
        <div className="sub">{rows.length === 0 ? 'Nothing to check' : `${rows.length} to check`}</div>
      </header>
      {rows.length === 0 ? (
        <div className="empty">
          <h2>All checked</h2>
          <p>Purchases Refund wasn’t sure about land here so you can fix the price before it starts watching.</p>
        </div>
      ) : (
        <section>{rows.map((p) => <PurchaseCard key={p.id} p={p} />)}</section>
      )}
    </main>
  );
}
