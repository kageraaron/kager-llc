import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fareClaimable, policyFor } from '@/lib/policies';
import { daysUntil, formatMoney, shortDate } from '@/lib/format';
import { purchaseTitle } from '@/lib/view';
import type { Segment } from '@/lib/pricing/serpapi';
import { PurchaseActions } from '@/components/Controls';

export const dynamic = 'force-dynamic';

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from('purchases').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();

  const [{ data: items }, { data: checks }] = await Promise.all([
    supabase.from('items').select('*').eq('purchase_id', id).order('created_at'),
    supabase.from('price_checks').select('checked_at, price_cents, matched, note, item_id').eq('purchase_id', id).order('checked_at', { ascending: false }).limit(12),
  ]);

  const policy = policyFor(p.merchant);
  const left = daysUntil(p.deadline_at);
  const segments = (p.details.segments as Segment[] | undefined) ?? [];
  const claimable = policy ? fareClaimable(policy, p.details, new Date(p.purchased_at)) : { ok: true };
  const title = purchaseTitle(p, items?.[0]?.title);

  return (
    <main className="page">
      <header className="page-header">
        <Link href={p.status === 'review' ? '/review' : '/'} className="muted btn-link">&larr; Back</Link>
        <h1 className="mt-2" style={{ fontSize: 24 }}>{title}</h1>
        <div className="sub">
          {p.merchant_name ?? policy?.name}
          {p.order_ref && ` · ${p.order_ref}`} · bought {shortDate(p.purchased_at)}
        </div>
      </header>

      <section className="panel">
        <div className="spread">
          <span className="muted">Paid</span>
          <strong>{formatMoney(p.total_cents)}</strong>
        </div>
        <div className="spread">
          <span className="muted">Claim window</span>
          <strong>
            {p.deadline_at
              ? left! > 0
                ? `${left} day${left === 1 ? '' : 's'} left · until ${shortDate(p.deadline_at)}`
                : `Closed ${shortDate(p.deadline_at)}`
              : 'No deadline found'}
          </strong>
        </div>
        {p.saved_cents > 0 && (
          <div className="spread">
            <span className="muted">Got back</span>
            <strong>{formatMoney(p.saved_cents)}</strong>
          </div>
        )}
        {policy && <p className="fine">{policy.window}. Comes back as: {policy.comesBackAs}.</p>}
        {!claimable.ok && <p className="error" style={{ margin: 0 }}>{claimable.why}</p>}
      </section>

      {p.status === 'review' && (
        <p className="muted">
          Refund read this from the email text rather than the order data, so check the total and details below,
          then confirm to start watching it.
        </p>
      )}

      <PurchaseActions
        id={p.id}
        status={p.status}
        kind={p.kind}
        total={p.total_cents != null ? (p.total_cents / 100).toFixed(2) : ''}
        fareBrand={(p.details.fare_brand as string) ?? ''}
        refundable={p.details.refundable as boolean | undefined}
        canCheck={!!policy?.priceSource}
      />

      {segments.length > 0 && (
        <section>
          <div className="section-label">Flights</div>
          <div className="panel">
            {segments.map((s, i) => (
              <div key={i} className="spread">
                <span>{s.carrier}{s.flight} · {s.from ?? '?'} → {s.to ?? '?'}</span>
                <span className="muted">{s.departs ? new Date(s.departs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
            <p className="fine">
              {(p.details.passengers as number) ?? 1} passenger{(p.details.passengers as number) > 1 ? 's' : ''}
              {p.details.fare_brand ? ` · ${p.details.fare_brand}` : ' · fare type unknown'}
            </p>
          </div>
        </section>
      )}

      {p.kind === 'hotel' && (
        <section>
          <div className="section-label">Stay</div>
          <div className="panel">
            <div>{p.details.property as string}{p.details.city ? `, ${p.details.city}` : ''}</div>
            <p className="fine">
              {shortDate(p.details.check_in as string)} → {shortDate(p.details.check_out as string)} ·{' '}
              {p.details.refundable === true ? 'Refundable' : p.details.refundable === false ? 'Non-refundable: can’t be rebooked cheaper' : 'Refundable? Unknown'}
            </p>
          </div>
        </section>
      )}

      {(items?.length ?? 0) > 0 && (
        <section>
          <div className="section-label">Items</div>
          {items!.map((it) => (
            <div key={it.id} className="panel">
              <div className="spread">
                <span>{it.url ? <a href={it.url} target="_blank" rel="noreferrer noopener">{it.title}</a> : it.title}</span>
                <strong>{formatMoney(it.unit_price_cents)}</strong>
              </div>
              <p className="fine">
                {it.quantity > 1 && `${it.quantity} × · `}
                {it.sku ? `SKU ${it.sku}` : 'No SKU'}
                {it.last_price_cents != null && ` · now ${formatMoney(it.last_price_cents)}`}
                {it.last_checked_at && ` · checked ${shortDate(it.last_checked_at)}`}
              </p>
            </div>
          ))}
        </section>
      )}

      {policy && (
        <section>
          <div className="section-label">How to claim</div>
          <div className="panel">
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              {policy.claimSteps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            {policy.claimUrl && (
              <a className="btn btn-block" href={policy.claimUrl} target="_blank" rel="noreferrer noopener">
                Open {policy.name}
              </a>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="section-label">Price checks</div>
        {(checks?.length ?? 0) === 0 ? (
          <p className="muted">
            {policy?.priceSource
              ? 'Not checked yet.'
              : `${policy?.name ?? 'This store'} has no sanctioned way to read prices, so Refund reminds you to check instead.`}
          </p>
        ) : (
          <div className="panel">
            {checks!.map((c, i) => (
              <div key={i} className="spread">
                <span className="muted">{new Date(c.checked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span>{c.matched ? formatMoney(c.price_cents) : <span className="muted">{c.note ?? 'No match'}</span>}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
