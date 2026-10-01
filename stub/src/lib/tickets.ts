/**
 * Combining ticket details when two records turn out to be the same show.
 *
 * A household is two people who may each buy tickets, or each log the same
 * night by hand. Both end up on ONE attendance row, and the question is what to
 * do with the two sets of details:
 *
 *   - The SAME order seen twice (a rescan, the same email in both inboxes, both
 *     people typing in the one booking) must not be counted twice.
 *   - Two DIFFERENT orders (each bought their own ticket) add up.
 *
 * The order reference is what tells them apart: details add up only when both
 * sides carry a reference and the references differ. Anything less certain is
 * treated as the same order, because showing 2 tickets as 4 is a worse mistake
 * than showing 2 as 1 that someone can correct.
 */
export interface TicketFields {
  ticket_ref: string | null;
  seat_info: string | null;
  price_cents: number | null;
  ticket_quantity: number | null;
  purchased_at: string | null;
}

const refs = (s: string | null | undefined) =>
  (s ?? '').split(',').map((r) => r.trim()).filter(Boolean);

export function combineTickets(
  kept: TicketFields,
  incoming: Partial<TicketFields>,
  /** For the same order: whose value wins. A rescan knows better; a merge keeps what's there. */
  prefer: 'kept' | 'incoming' = 'kept',
): TicketFields {
  const have = refs(kept.ticket_ref);
  const fresh = refs(incoming.ticket_ref).filter((r) => !have.includes(r));
  const separateOrder = have.length > 0 && fresh.length > 0;

  const pick = <T>(a: T | null | undefined, b: T | null | undefined): T | null =>
    (prefer === 'incoming' ? b ?? a : a ?? b) ?? null;
  const sum = (a: number | null | undefined, b: number | null | undefined): number | null =>
    a != null && b != null ? a + b : a ?? b ?? null;
  const earliest = [kept.purchased_at, incoming.purchased_at].filter(Boolean).sort()[0] ?? null;

  return {
    ticket_ref: [...have, ...fresh].join(', ') || null,
    ticket_quantity: separateOrder ? sum(kept.ticket_quantity, incoming.ticket_quantity) : pick(kept.ticket_quantity, incoming.ticket_quantity),
    price_cents: separateOrder ? sum(kept.price_cents, incoming.price_cents) : pick(kept.price_cents, incoming.price_cents),
    seat_info:
      separateOrder && kept.seat_info && incoming.seat_info && kept.seat_info !== incoming.seat_info
        ? `${kept.seat_info}; ${incoming.seat_info}`
        : pick(kept.seat_info, incoming.seat_info),
    purchased_at: separateOrder ? earliest : pick(kept.purchased_at, incoming.purchased_at),
  };
}
