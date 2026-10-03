'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addPurchase,
  checkNow,
  confirmPurchase,
  dismissPurchase,
  editPurchase,
  addCredit,
  markClaimed,
  scanNow,
  setCreditStatus,
  updateCreditExpiry,
  updateSettings,
} from '@/app/actions';
import type { BestBuyTier } from '@/lib/policies';

type Result = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const run = (fn: () => Promise<Result & Record<string, unknown>>, ok?: (r: Record<string, unknown>) => string | null) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if (!r.ok) setNote(r.error ?? 'Something went wrong');
      else {
        setNote(ok ? ok(r) : null);
        router.refresh();
      }
    });
  return { pending, note, run };
}

/** Read new order emails now instead of waiting for the next run. */
export function ScanButton() {
  const { pending, note, run } = useAction();
  return (
    <div className="head-actions">
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          run(() => scanNow(), (r) =>
            `Read ${r.read} email${r.read === 1 ? '' : 's'} · ${r.purchases} new${r.review ? `, ${r.review} to review` : ''}`)
        }
      >
        {pending ? 'Scanning…' : 'Scan'}
      </button>
      {note && <span className="fine">{note}</span>}
    </div>
  );
}

export function PurchaseActions(props: {
  id: string;
  status: string;
  kind: string;
  total: string;
  fareBrand: string;
  refundable?: boolean;
  canCheck: boolean;
}) {
  const { pending, note, run } = useAction();
  const [total, setTotal] = useState(props.total);
  const [fareBrand, setFareBrand] = useState(props.fareBrand);
  const [refundable, setRefundable] = useState(props.refundable);
  const [claimed, setClaimed] = useState('');
  const [asCredit, setAsCredit] = useState(props.kind === 'flight');
  const editing = props.status === 'review';
  const dirty = total !== props.total || fareBrand !== props.fareBrand || refundable !== props.refundable;

  return (
    <section className="panel">
      <label className="stack">
        <span className="muted">Total paid ($)</span>
        <input className="input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
      </label>
      {props.kind === 'flight' && (
        <label className="stack">
          <span className="muted">Fare type (e.g. Main Cabin, Basic Economy, Choice)</span>
          <input className="input" value={fareBrand} onChange={(e) => setFareBrand(e.target.value)} />
        </label>
      )}
      {props.kind === 'hotel' && (
        <label className="spread">
          <span>Refundable rate</span>
          <input type="checkbox" checked={refundable === true} onChange={(e) => setRefundable(e.target.checked)} />
        </label>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {dirty && (
          <button className="btn" disabled={pending} onClick={() => run(() => editPurchase(props.id, { total, fareBrand, refundable }))}>
            Save changes
          </button>
        )}
        {editing && (
          <button className="btn btn-primary" disabled={pending || dirty} onClick={() => run(() => confirmPurchase(props.id))}>
            Looks right, watch it
          </button>
        )}
        {props.status === 'watching' && props.canCheck && (
          <button className="btn" disabled={pending} onClick={() => run(() => checkNow(props.id), () => 'Checked')}>
            {pending ? 'Checking…' : 'Check price now'}
          </button>
        )}
        {['watching', 'review'].includes(props.status) && (
          <button className="btn" disabled={pending} onClick={() => run(() => dismissPurchase(props.id))}>
            Stop watching
          </button>
        )}
      </div>

      {props.status === 'watching' && (
        <div className="row">
          <input
            className="input"
            style={{ flex: 1 }}
            inputMode="decimal"
            placeholder="Got money back? Amount ($)"
            value={claimed}
            onChange={(e) => setClaimed(e.target.value)}
          />
          <button className="btn" disabled={pending || !claimed} onClick={() => run(() => markClaimed(props.id, claimed, props.kind === 'flight' && asCredit), () => 'Recorded')}>
            I claimed it
          </button>
        </div>
      )}
      {props.status === 'watching' && props.kind === 'flight' && (
        <label className="spread">
          <span className="fine">It came back as a travel credit (track it, with an expiry reminder)</span>
          <input type="checkbox" checked={asCredit} onChange={(e) => setAsCredit(e.target.checked)} />
        </label>
      )}
      {note && <p className={/recorded|checked/i.test(note) ? 'fine' : 'error'} style={{ margin: 0 }}>{note}</p>}
    </section>
  );
}

const MERCHANTS: [string, string][] = [
  ['amazon', 'Amazon'], ['bestbuy', 'Best Buy'], ['target', 'Target'], ['costco', 'Costco'],
  ['delta', 'Delta'], ['united', 'United'], ['american', 'American'], ['alaska', 'Alaska'], ['southwest', 'Southwest'],
  ['hotel', 'Hotel'],
];
const KIND: Record<string, 'retail' | 'flight' | 'hotel'> = {
  amazon: 'retail', bestbuy: 'retail', target: 'retail', costco: 'retail', hotel: 'hotel',
  delta: 'flight', united: 'flight', american: 'flight', alaska: 'flight', southwest: 'flight',
};

/** A purchase Gmail didn't catch. */
export function AddForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ merchant: 'bestbuy', purchasedAt: new Date().toISOString().slice(0, 10) });
  const [refundable, setRefundable] = useState(true);
  const kind = KIND[f.merchant];
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="stack">
      <span className="muted">{label}</span>
      <input className="input" value={f[name] ?? ''} onChange={(e) => setF({ ...f, [name]: e.target.value })} {...props} />
    </label>
  );

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await addPurchase({ ...f, merchant: f.merchant, purchasedAt: f.purchasedAt, refundable });
          if (!r.ok) setError(r.error);
          else router.push(`/purchases/${r.id}`);
        });
      }}
    >
      <label className="stack">
        <span className="muted">Where</span>
        <select className="input" value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })}>
          {MERCHANTS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      {field('purchasedAt', 'Bought on', { type: 'date', required: true })}
      {field('total', f.merchant === 'amazon' ? 'Item price before tax ($)' : 'Total paid ($)', { inputMode: 'decimal', required: true })}
      {field('orderRef', kind === 'flight' ? 'Confirmation code' : 'Order or confirmation number')}

      {kind === 'retail' && (
        <>
          {field('itemTitle', 'Item', { required: true })}
          {f.merchant === 'bestbuy' && field('sku', 'Best Buy SKU (optional; on the product page)', { inputMode: 'numeric' })}
          {f.merchant === 'amazon' && field('sku', 'Amazon product link or ASIN (lets Refund check the price)')}
        </>
      )}

      {kind === 'flight' && (
        <>
          <div className="row">
            {field('from', 'From (airport)', { placeholder: 'SFO', maxLength: 3 })}
            {field('to', 'To', { placeholder: 'JFK', maxLength: 3 })}
          </div>
          {field('flights', 'Outbound flights', { placeholder: 'DL123 DL456' })}
          {field('departs', 'Outbound departs', { type: 'datetime-local' })}
          {field('returnFlights', 'Return flights (if round trip)', { placeholder: 'DL789' })}
          {field('returnDeparts', 'Return departs', { type: 'datetime-local' })}
          <div className="row">
            {field('fareBrand', 'Fare type', { placeholder: 'Main Cabin' })}
            {field('passengers', 'Passengers', { inputMode: 'numeric', placeholder: '1' })}
          </div>
        </>
      )}

      {kind === 'hotel' && (
        <>
          {field('property', 'Hotel', { required: true })}
          {field('city', 'City')}
          <div className="row">
            {field('checkIn', 'Check in', { type: 'date' })}
            {field('checkOut', 'Check out', { type: 'date' })}
          </div>
          <label className="spread">
            <span>Refundable rate</span>
            <input type="checkbox" checked={refundable} onChange={(e) => setRefundable(e.target.checked)} />
          </label>
        </>
      )}

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Saving…' : 'Start watching'}</button>
    </form>
  );
}

export function SettingsForm(props: { bestbuyTier: BestBuyTier; storeMin: number; flightMin: number; minPct: number }) {
  const { pending, note, run } = useAction();
  const [tier, setTier] = useState(props.bestbuyTier);
  const [storeMin, setStoreMin] = useState(String(props.storeMin / 100));
  const [flightMin, setFlightMin] = useState(String(props.flightMin / 100));
  const [minPct, setMinPct] = useState(String(props.minPct));

  return (
    <div className="panel">
      <label className="stack">
        <span className="muted">My Best Buy membership (sets the window: 15 or 60 days)</span>
        <select className="input" value={tier} onChange={(e) => setTier(e.target.value as BestBuyTier)}>
          <option value="standard">Free / none (15 days)</option>
          <option value="plus">Plus (60 days)</option>
          <option value="total">Total (60 days)</option>
        </select>
      </label>
      <div className="row">
        <label className="stack" style={{ flex: 1 }}>
          <span className="muted">Store alert from ($)</span>
          <input className="input" inputMode="decimal" value={storeMin} onChange={(e) => setStoreMin(e.target.value)} />
        </label>
        <label className="stack" style={{ flex: 1 }}>
          <span className="muted">Travel alert from ($)</span>
          <input className="input" inputMode="decimal" value={flightMin} onChange={(e) => setFlightMin(e.target.value)} />
        </label>
        <label className="stack" style={{ flex: 1 }}>
          <span className="muted">and at least (%)</span>
          <input className="input" inputMode="decimal" value={minPct} onChange={(e) => setMinPct(e.target.value)} />
        </label>
      </div>
      <button
        className="btn btn-block"
        disabled={pending}
        onClick={() => run(() => updateSettings({ bestbuyTier: tier, storeMin, flightMin, minPct }), () => 'Saved')}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {note && <p className={note === 'Saved' ? 'fine' : 'error'} style={{ margin: 0 }}>{note}</p>}
    </div>
  );
}

/** A credit Refund didn't record itself. */
export function AddCreditForm() {
  const { pending, note, run } = useAction();
  const [f, setF] = useState<Record<string, string>>({ rule: 'book_by' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addCredit({ label: f.label ?? '', amount: f.amount, expiresAt: f.expiresAt, rule: f.rule as 'book_by' | 'travel_by', code: f.code }),
          () => { setF({ rule: 'book_by' }); return 'Added'; },
        );
      }}
    >
      <label className="stack">
        <span className="muted">What is it</span>
        <input className="input" placeholder="Delta eCredit" value={f.label ?? ''} onChange={set('label')} required />
      </label>
      <div className="row">
        <label className="stack" style={{ flex: 1 }}>
          <span className="muted">Amount ($)</span>
          <input className="input" inputMode="decimal" value={f.amount ?? ''} onChange={set('amount')} />
        </label>
        <label className="stack" style={{ flex: 1 }}>
          <span className="muted">Expires</span>
          <input className="input" type="date" value={f.expiresAt ?? ''} onChange={set('expiresAt')} />
        </label>
      </div>
      <label className="stack">
        <span className="muted">By that date you must</span>
        <select className="input" value={f.rule} onChange={set('rule')}>
          <option value="book_by">Book a trip (fly later)</option>
          <option value="travel_by">Have flown</option>
        </select>
      </label>
      <label className="stack">
        <span className="muted">Credit or certificate number (optional)</span>
        <input className="input" value={f.code ?? ''} onChange={set('code')} autoComplete="off" />
      </label>
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Saving…' : 'Track this credit'}</button>
      {note && <p className={note === 'Added' ? 'fine' : 'error'} style={{ margin: 0 }}>{note}</p>}
    </form>
  );
}

export function CreditActions({ id, status, expiresAt }: { id: string; status: string; expiresAt: string | null }) {
  const { pending, note, run } = useAction();
  const [date, setDate] = useState(expiresAt ?? '');
  return (
    <div className="stack">
      <div className="row">
        <input className="input" style={{ flex: 1 }} type="date" value={date} aria-label="Expiry date" onChange={(e) => setDate(e.target.value)} />
        {date !== (expiresAt ?? '') && (
          <button className="btn" disabled={pending} onClick={() => run(() => updateCreditExpiry(id, date))}>Save date</button>
        )}
        <button className="btn" disabled={pending} onClick={() => run(() => setCreditStatus(id, status === 'used' ? 'active' : 'used'))}>
          {status === 'used' ? 'Not used yet' : 'Mark used'}
        </button>
      </div>
      {note && <p className="error" style={{ margin: 0 }}>{note}</p>}
    </div>
  );
}
