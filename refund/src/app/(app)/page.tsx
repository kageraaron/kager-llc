import { createClient } from '@/lib/supabase/server';
import { loadPurchases } from '@/lib/view';
import { formatMoney } from '@/lib/format';
import { PurchaseCard } from '@/components/PurchaseCard';
import { ScanButton } from '@/components/Controls';

export const dynamic = 'force-dynamic';

/** Open windows, soonest deadline first; anything that has dropped on top. */
export default async function WatchingPage() {
  const supabase = await createClient();
  const watching = await loadPurchases(supabase, { statuses: ['watching'] });
  const { data: savedRows } = await supabase.from('purchases').select('saved_cents').gt('saved_cents', 0);
  const saved = (savedRows ?? []).reduce((s, r) => s + r.saved_cents, 0);

  const dropped = watching.filter((p) => p.total_cents != null && p.nowCents != null && p.nowCents < p.total_cents);
  const rest = watching.filter((p) => !dropped.includes(p));

  return (
    <main className="page">
      <header className="page-header">
        <div className="head-row">
          <div>
            <h1>Refund</h1>
            <div className="sub">
              {watching.length === 0 ? 'Nothing being watched' : `${watching.length} open window${watching.length === 1 ? '' : 's'}`}
              {saved > 0 && ` · ${formatMoney(saved)} back so far`}
            </div>
          </div>
          <ScanButton />
        </div>
      </header>

      {watching.length === 0 ? (
        <div className="empty">
          <h2>Nothing to watch yet</h2>
          <p>
            Refund reads order and booking emails from Best Buy, Target, Costco, the big US airlines and
            hotels, then watches each price until its claim window closes. Tap Scan to look now.
          </p>
        </div>
      ) : (
        <>
          {dropped.length > 0 && (
            <section>
              <div className="section-label">Price dropped</div>
              {dropped.map((p) => <PurchaseCard key={p.id} p={p} />)}
            </section>
          )}
          {rest.length > 0 && (
            <section>
              <div className="section-label">Watching</div>
              {rest.map((p) => <PurchaseCard key={p.id} p={p} />)}
            </section>
          )}
        </>
      )}
    </main>
  );
}
