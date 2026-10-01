import { describe, it, expect } from 'vitest';
import { combineTickets, type TicketFields } from '@/lib/tickets';

const t = (over: Partial<TicketFields>): TicketFields => ({
  ticket_ref: null, seat_info: null, price_cents: null, ticket_quantity: null, purchased_at: null, ...over,
});

describe('combining ticket details for one show', () => {
  it('adds up two different orders (each person bought their own)', () => {
    const out = combineTickets(
      t({ ticket_ref: 'AA1', ticket_quantity: 1, price_cents: 8000, seat_info: 'GA' }),
      t({ ticket_ref: 'BB2', ticket_quantity: 1, price_cents: 8500, seat_info: 'GA' }),
    );
    expect(out).toMatchObject({ ticket_ref: 'AA1, BB2', ticket_quantity: 2, price_cents: 16500, seat_info: 'GA' });
  });

  it('does not double-count the same order seen twice', () => {
    const a = t({ ticket_ref: 'AA1', ticket_quantity: 4, price_cents: 12000 });
    expect(combineTickets(a, a)).toMatchObject({ ticket_ref: 'AA1', ticket_quantity: 4, price_cents: 12000 });
    // ...including after an earlier combine.
    const both = combineTickets(a, t({ ticket_ref: 'BB2', ticket_quantity: 1, price_cents: 3000 }));
    expect(combineTickets(both, t({ ticket_ref: 'BB2', ticket_quantity: 1, price_cents: 3000 })).ticket_quantity).toBe(5);
  });

  it('treats two hand-logged entries with no order number as one booking', () => {
    const out = combineTickets(t({ ticket_quantity: 4 }), t({ ticket_quantity: 4 }));
    expect(out.ticket_quantity).toBe(4);
  });

  it('fills gaps from the other side', () => {
    const out = combineTickets(t({ ticket_quantity: 3 }), t({ ticket_ref: 'AA1', price_cents: 9000, seat_info: 'Sec K' }));
    expect(out).toMatchObject({ ticket_ref: 'AA1', ticket_quantity: 3, price_cents: 9000, seat_info: 'Sec K' });
  });

  it('lets a rescan of the same order correct the details', () => {
    const out = combineTickets(t({ ticket_ref: 'AA1', ticket_quantity: 1 }), t({ ticket_ref: 'AA1', ticket_quantity: 2 }), 'incoming');
    expect(out.ticket_quantity).toBe(2);
  });
});
