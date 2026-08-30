'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTicketDetails } from '@/app/actions';
import { formatPrice, formatQuantity } from '@/lib/format';

interface Props {
  eventId: string;
  quantity: number | null;
  priceCents: number | null;
  seatInfo: string | null;
  ticketRef: string | null;
}

/**
 * What the order was: how many tickets, what they cost, and the per-ticket
 * figure that neither number gives you on its own.
 *
 * Both values are extracted from the confirmation email when the receipt shows
 * them, but a guest-list add has no price and a transfer has no order table, so
 * this is also where they get filled in by hand.
 */
export function TicketDetails({ eventId, quantity, priceCents, seatInfo, ticketRef }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [qty, setQty] = useState(quantity ? String(quantity) : '');
  const [price, setPrice] = useState(priceCents != null ? (priceCents / 100).toFixed(2) : '');

  const total = formatPrice(priceCents);
  const count = formatQuantity(quantity);
  // Only worth showing when it says something the two numbers do not: a single
  // ticket's "each" price is just the total again.
  const each =
    priceCents != null && quantity != null && quantity > 1
      ? formatPrice(Math.round(priceCents / quantity))
      : null;

  function save() {
    setError(null);
    startTransition(async () => {
      const parsedQty = qty.trim() === '' ? null : Number(qty);
      const parsedPrice = price.trim() === '' ? null : Math.round(Number(price) * 100);

      if (parsedQty !== null && !Number.isInteger(parsedQty)) {
        setError('Ticket count must be a whole number');
        return;
      }
      if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
        setError('That price does not look right');
        return;
      }

      const res = await setTicketDetails(eventId, {
        ticketQuantity: parsedQty,
        priceCents: parsedPrice,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <label className="stack" style={{ gap: 4, flex: 1 }}>
            <span className="muted" style={{ fontSize: 12 }}>Tickets</span>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1 }}>
            <span className="muted" style={{ fontSize: 12 }}>Total paid</span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 4, marginTop: 12 }}>
      {seatInfo && <div className="muted">Seat: {seatInfo}</div>}
      {ticketRef && <div className="muted">Order {ticketRef}</div>}
      {(total || count) && (
        <div className="muted">
          {[total && `Paid ${total}`, count].filter(Boolean).join(' · ')}
          {each && ` (${each} each)`}
        </div>
      )}
      <button
        className="muted"
        style={{ alignSelf: 'flex-start', fontSize: 13, textDecoration: 'underline', padding: 0 }}
        onClick={() => setEditing(true)}
      >
        {total || count ? 'Edit ticket details' : 'Add ticket count and price'}
      </button>
    </div>
  );
}
