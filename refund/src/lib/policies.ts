/**
 * Who gives money back when a price drops, and on what terms.
 *
 * This file is the research doc ("Refund: price-drop policies and v1 plan")
 * turned into code. Every number here came from the merchant's own policy page
 * where one exists; `source` names it. When a policy changes, change it here.
 *
 * Deliberately absent: Walmart and Amazon. Neither has a dependable
 * after-purchase price adjustment, and tracking them would promise money that
 * isn't coming.
 */

export type Kind = 'retail' | 'flight' | 'hotel';
export type BestBuyTier = 'standard' | 'plus' | 'total';

/** How Refund learns today's price, if it can at all. */
export type PriceSource = 'bestbuy' | 'serpapi_flights' | 'serpapi_hotels' | null;

export interface Policy {
  id: string;
  name: string;
  kind: Kind;
  /** Order/booking emails come from these (matched as suffixes). */
  senderDomains: string[];
  priceSource: PriceSource;
  /** Plain words for the window, shown on the purchase page. */
  window: string;
  comesBackAs: string;
  claimSteps: string[];
  claimUrl?: string;
  /** For merchants Refund can't price-check: day after purchase to nudge. */
  remindOnDay?: number;
  source: string;
}

export const POLICIES: Policy[] = [
  {
    id: 'costco',
    name: 'Costco',
    kind: 'retail',
    senderDomains: ['costco.com'],
    priceSource: null,
    window: '30 days after purchase',
    comesBackAs: 'Refund to your original payment, in 5–10 business days',
    claimSteps: [
      'Check the item on Costco.com. Only Costco’s own lower price counts.',
      'Costco.com → Customer Service → price adjustment request, and pick this order.',
      'Bought in a warehouse? Take the receipt to that warehouse’s returns counter.',
    ],
    claimUrl: 'https://www.costco.com/',
    remindOnDay: 21,
    source: 'Costco price adjustment form (no public policy page); see research doc',
  },
  {
    id: 'bestbuy',
    name: 'Best Buy',
    kind: 'retail',
    senderDomains: ['bestbuy.com', 'emailinfo.bestbuy.com'],
    priceSource: 'bestbuy',
    window: 'Return period: 15 days, or 60 for My Best Buy Plus and Total',
    comesBackAs: 'Refund to your original payment',
    claimSteps: [
      'Open the order on BestBuy.com → Order Details.',
      'Tap “See details” next to price match, or start a chat and ask for a price match on the item.',
      'Marketplace, clearance, open-box and refurbished items don’t qualify.',
    ],
    claimUrl: 'https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c?id=pcmcat290300050002',
    remindOnDay: 10,
    source: 'https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c?id=pcmcat290300050002',
  },
  {
    id: 'target',
    name: 'Target',
    kind: 'retail',
    senderDomains: ['target.com', 'oe.target.com'],
    priceSource: null,
    window: '14 days after purchase',
    comesBackAs: 'Refund to your original payment',
    claimSteps: [
      'Check the item on Target.com. Only Target’s own price or an automatic Circle deal counts.',
      'Chat with Target (or call 1-800-591-3869) and ask for a price match, with the order number and the lower price.',
      'Clearance and Circle Bonuses don’t qualify.',
    ],
    claimUrl: 'https://www.target.com/help/articles/policies-guidelines/price-match-guarantee',
    remindOnDay: 10,
    source: 'https://www.target.com/help/articles/policies-guidelines/price-match-guarantee',
  },
  {
    id: 'southwest',
    name: 'Southwest',
    kind: 'flight',
    senderDomains: ['southwest.com', 'luv.southwest.com', 'ifly.southwest.com'],
    priceSource: 'serpapi_flights',
    window: 'Until 10 minutes before departure (Choice fares and up)',
    comesBackAs: 'Choice: 12-month travel credit. Choice Preferred and Extra: original payment',
    claimSteps: [
      'Southwest.com → Manage reservation → Change flight.',
      'Pick the same flights. The difference comes back automatically.',
      'Basic fares can’t be changed: only cancelled for a 6-month credit.',
    ],
    claimUrl: 'https://www.southwest.com/',
    source: 'https://www.southwest.com/airfare-types-benefits/',
  },
  ...(
    [
      ['delta', 'Delta', ['delta.com', 't.delta.com'], 'eCredit, valid 1 year from purchase', 'https://www.delta.com/'],
      ['united', 'United', ['united.com', 'news.united.com'], 'Future Flight Credit', 'https://www.united.com/'],
      ['american', 'American', ['aa.com', 'info.email.aa.com'], 'Trip Credit', 'https://www.aa.com/'],
      ['alaska', 'Alaska', ['alaskaair.com', 'ifly.alaskaair.com'], 'Credit in My Wallet', 'https://www.alaskaair.com/'],
    ] as const
  ).map(([id, name, domains, credit, url]): Policy => ({
    id,
    name,
    kind: 'flight',
    senderDomains: [...domains],
    priceSource: 'serpapi_flights',
    window: 'Until departure (Main Cabin and up; Basic only within 24 hours)',
    comesBackAs: credit,
    claimSteps: [
      `${name}’s site → My Trips → Change flight.`,
      'Pick the exact same flights and cabin. The lower fare shows as a credit back.',
      'Basic Economy can’t be changed after 24 hours.',
    ],
    claimUrl: url,
    source: 'https://www.refare.com/post/the-2026-airline-price-drop-audit-delta-vs-american-vs-united-vs-southwest',
  })),
  {
    id: 'hotel',
    name: 'Hotel',
    kind: 'hotel',
    senderDomains: [
      'marriott.com', 'hilton.com', 'hyatt.com', 'ihg.com', 'email.ihg.com',
      'booking.com', 'hotels.com', 'expedia.com', 'wyndhamhotels.com', 'choicehotels.com',
    ],
    priceSource: 'serpapi_hotels',
    window: 'Until the free-cancellation deadline (refundable rates only)',
    comesBackAs: 'Book the cheaper rate, then cancel the original',
    claimSteps: [
      'Book the same room and dates at the lower rate first.',
      'Then cancel the original booking before its free-cancellation deadline.',
      'Only refundable rates: a prepaid, non-refundable booking can’t be swapped.',
    ],
    source: 'Hotel cancellation terms on each booking',
  },
];

const BY_ID = new Map(POLICIES.map((p) => [p.id, p]));

export function policyFor(id: string): Policy | undefined {
  return BY_ID.get(id);
}

/** The policy whose sender domain this address ends in. */
export function policyForSender(from: string): Policy | undefined {
  const domain = from.toLowerCase().match(/@([^>\s]+)/)?.[1] ?? from.toLowerCase();
  return POLICIES.find((p) => p.senderDomains.some((d) => domain === d || domain.endsWith(`.${d}`)));
}

/** Every sender Refund reads, for the Gmail search. */
export const ALL_SENDER_DOMAINS = [...new Set(POLICIES.flatMap((p) => p.senderDomains))];

const DAY = 86_400_000;

/**
 * When the window closes.
 *
 * Retail: purchase + window days. Flights: departure of the first segment
 * (Southwest allows changes until 10 minutes before). Hotels: the
 * free-cancellation deadline, else check-in.
 */
export function deadlineFor(
  policy: Policy,
  purchasedAt: Date,
  details: Record<string, unknown>,
  opts: { bestbuyTier?: BestBuyTier } = {},
): Date | null {
  switch (policy.id) {
    case 'costco':
      return new Date(purchasedAt.getTime() + 30 * DAY);
    case 'target':
      return new Date(purchasedAt.getTime() + 14 * DAY);
    case 'bestbuy':
      return new Date(purchasedAt.getTime() + (opts.bestbuyTier && opts.bestbuyTier !== 'standard' ? 60 : 15) * DAY);
  }
  if (policy.kind === 'flight') {
    const segs = (details.segments as { departs?: string }[] | undefined) ?? [];
    const first = segs.map((s) => s.departs).filter(Boolean).sort()[0];
    if (!first) return null;
    const departs = new Date(first);
    return policy.id === 'southwest' ? new Date(departs.getTime() - 10 * 60_000) : departs;
  }
  if (policy.kind === 'hotel') {
    const cancelBy = details.cancel_by as string | undefined;
    const checkIn = details.check_in as string | undefined;
    return cancelBy ? new Date(cancelBy) : checkIn ? new Date(checkIn) : null;
  }
  return null;
}

/**
 * Can a lower price on this fare actually be claimed? Basic Economy (and
 * Southwest's Basic) can't be changed, except inside the US DOT 24-hour window
 * (booked under 24h ago, departure at least 7 days out), when any fare can be
 * cancelled for a full refund.
 */
export function fareClaimable(
  policy: Policy,
  details: { fare_brand?: string; segments?: { departs?: string }[] },
  purchasedAt: Date,
  now = new Date(),
): { ok: boolean; why?: string } {
  if (policy.kind !== 'flight') return { ok: true };
  const departs = details.segments?.map((s) => s.departs).filter(Boolean).sort()[0];
  const in24h = now.getTime() - purchasedAt.getTime() < DAY;
  const sevenOut = departs ? new Date(departs).getTime() - purchasedAt.getTime() >= 7 * DAY : false;
  if (in24h && sevenOut) return { ok: true, why: 'Inside the 24-hour free cancellation window' };

  const brand = (details.fare_brand ?? '').toLowerCase();
  if (/basic/.test(brand)) return { ok: false, why: 'Basic fares can’t be changed after 24 hours' };
  return { ok: true };
}

/**
 * Is a drop worth a push? Both floors must clear: a flat minimum and a
 * percentage, so a $12 drop on a $40 toaster counts and a $12 drop on a $900
 * laptop doesn't wake anyone.
 */
export function worthAlerting(
  kind: Kind,
  paidCents: number,
  nowCents: number,
  settings: { store_min_cents: number; flight_min_cents: number; min_pct: number },
): boolean {
  const saved = paidCents - nowCents;
  if (saved <= 0) return false;
  const floor = kind === 'retail' ? settings.store_min_cents : settings.flight_min_cents;
  return saved >= floor && (saved / paidCents) * 100 >= settings.min_pct;
}

export const DEFAULT_SETTINGS = {
  bestbuy_tier: 'standard' as BestBuyTier,
  store_min_cents: 1000,
  flight_min_cents: 3000,
  min_pct: 5,
};
