import Link from 'next/link';
import { daysUntil, formatMoney } from '@/lib/format';
import type { PurchaseView } from '@/lib/view';

/**
 * One purchase: what it is, what was paid, and how long is left to claim.
 * The countdown is the point of the app, so it sits where the date chip does
 * on Stub's cards.
 */
export function PurchaseCard({ p }: { p: PurchaseView }) {
  const left = daysUntil(p.deadline_at);
  const drop = p.total_cents != null && p.nowCents != null ? p.total_cents - p.nowCents : 0;

  return (
    <Link href={`/purchases/${p.id}`} className="card">
      <div className="date-chip">
        {left == null ? (
          <div className="mon">no date</div>
        ) : left <= 0 ? (
          <div className="mon">closed</div>
        ) : (
          <>
            <div className="day">{left}</div>
            <div className="mon">{left === 1 ? 'day' : 'days'}</div>
          </>
        )}
      </div>
      <div className="body">
        <div className="title">{p.title}</div>
        <div className="meta">
          {p.merchant_name ?? p.merchant}
          {p.order_ref && ` · ${p.order_ref}`}
        </div>
        <div className="meta">
          Paid {formatMoney(p.total_cents)}
          {p.nowCents != null && <> · now <span className="meta-lead">{formatMoney(p.nowCents)}</span></>}
        </div>
        {(drop > 0 || p.status === 'review' || p.saved_cents > 0) && (
          <div className="row mt-2">
            {drop > 0 && <span className="pill pill-going">Down {formatMoney(drop)}</span>}
            {p.status === 'review' && <span className="pill pill-review">Needs a look</span>}
            {p.saved_cents > 0 && <span className="pill">Saved {formatMoney(p.saved_cents)}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
