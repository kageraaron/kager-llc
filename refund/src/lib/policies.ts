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
export type PriceSource = 'serpapi_flights' | 'serpapi_hotels' | 'serpapi_amazon' | null;

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
  /** The store's return window, when it has one worth tracking. */
  returns?: ReturnRule;
  source: string;
}

export interface ReturnRule {
  /** Days for most items; null when the store sets no limit. */
  days: number | null;
  /** Shown beside the date: the shorter windows some categories get. */
  note: string;
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
    returns: {
      days: null,
      note: 'No time limit on most items. Electronics (TVs, computers, tablets, phones, cameras, major appliances): 90 days.',
      source: 'https://customerservice.costco.com/app/answers/answer_view/a_id/1191',
    },
    source: 'Costco price adjustment form (no public policy page); see research doc',
  },
  {
    id: 'bestbuy',
    name: 'Best Buy',
    kind: 'retail',
    senderDomains: ['bestbuy.com', 'emailinfo.bestbuy.com'],
    // Best Buy's Products API needs a developer key that is no longer issued to
    // individuals, so its prices can't be checked: a deadline reminder instead,
    // like Target and Costco.
    priceSource: null,
    window: 'Return period: 15 days, or 60 for My Best Buy Plus and Total',
    comesBackAs: 'Refund to your original payment',
    claimSteps: [
      'Open the order on BestBuy.com → Order Details.',
      'Tap “See details” next to price match, or start a chat and ask for a price match on the item.',
      'Marketplace, clearance, open-box and refurbished items don’t qualify.',
    ],
    claimUrl: 'https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c?id=pcmcat290300050002',
    remindOnDay: 10,
    returns: {
      // Same period as the price match: set from the membership tier in returnBy().
      days: 15,
      note: '15 days; 60 for My Best Buy Plus and Total. Holiday decorations are always 15.',
      source: 'https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c?id=pcmcat260800050014',
    },
    source: 'https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c?id=pcmcat290300050002',
  },
  {
    /*
     * Amazon gives nothing back when its price drops. What it does have is a
     * return window, so the "claim" is to buy again at the lower price and
     * send the first one back. The window watched here is that return window.
     */
    id: 'amazon',
    name: 'Amazon',
    kind: 'retail',
    senderDomains: ['amazon.com'],
    priceSource: 'serpapi_amazon',
    window: '30 days (Amazon’s return window; there is no price adjustment)',
    comesBackAs: 'Nothing automatically: you rebuy at the lower price and return the first one',
    claimSteps: [
      'Amazon does not refund the difference when its own price drops.',
      'If the drop is worth the trouble: order it again at the new price, then return the first one from Your Orders → Return or replace items.',
      'Check that the return is free before you do: it usually is for items sold by Amazon, not always for other sellers or very large items.',
      'Or ask Amazon’s chat for a courtesy credit of the difference. It is at their discretion.',
    ],
    claimUrl: 'https://www.amazon.com/returns',
    returns: {
      days: 30,
      note: '30 days from delivery for most items. Holiday purchases have had a longer window in past years. Verify on the order itself.',
      source: 'Secondary sources; verify at amazon.com/returns',
    },
    source: 'Amazon has no price-adjustment policy; verify at amazon.com/returns',
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
    returns: {
      days: 90,
      note: '90 days for most items; electronics 30 and Apple products 15. Check the receipt: Target’s own page could not be read when this was written.',
      source: 'Secondary sources; verify at target.com/returns',
    },
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
      // Chains send reservations from domains that are not their website's.
      'res-marriott.com', 'email-marriott.com', 'all.com', 'accor.com', 'radissonhotels.com', 'super.com',
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
    case 'amazon':
      // The return window runs from delivery; from purchase is the safe side of that.
      return new Date(purchasedAt.getTime() + 30 * DAY);
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

/** When a store purchase can still be returned, or null for no limit / not a store. */
export function returnBy(policy: Policy, purchasedAt: Date, opts: { bestbuyTier?: BestBuyTier } = {}): Date | null {
  if (!policy.returns?.days) return null;
  const days = policy.id === 'bestbuy' && opts.bestbuyTier && opts.bestbuyTier !== 'standard' ? 60 : policy.returns.days;
  return new Date(purchasedAt.getTime() + days * DAY);
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

// ------------------------------------------------------------------ credits

export interface CreditRule {
  label: string;
  /** Months until it lapses, counted from `basis`. */
  months: number;
  basis: 'purchase' | 'issue';
  rule: 'book_by' | 'travel_by';
}

/**
 * How long an airline credit lasts, for prefilling its expiry when a fare drop
 * is claimed. The airline's own email is the authority; this is the default
 * until the person corrects it.
 * Source: https://withautopilot.com/blog/airline-flight-credits-compared
 */
export function creditRuleFor(policyId: string, fareBrand?: string): CreditRule | null {
  switch (policyId) {
    case 'delta':
      // One year from the ORIGINAL ticket purchase, not from the change.
      return { label: 'Delta eCredit', months: 12, basis: 'purchase', rule: 'book_by' };
    case 'united':
      return { label: 'United Future Flight Credit', months: 12, basis: 'issue', rule: 'travel_by' };
    case 'american':
      return { label: 'American Trip Credit', months: 12, basis: 'issue', rule: 'book_by' };
    case 'alaska':
      return { label: 'Alaska credit', months: 12, basis: 'purchase', rule: 'book_by' };
    case 'southwest':
      // Choice Preferred and Extra come back to the original payment: no credit.
      if (/preferred|extra/i.test(fareBrand ?? '')) return null;
      return { label: 'Southwest flight credit', months: /basic/i.test(fareBrand ?? '') ? 6 : 12, basis: 'purchase', rule: 'book_by' };
    default:
      return null;
  }
}

export function creditExpiry(rule: CreditRule, purchasedAt: Date, issuedAt = new Date()): Date {
  const from = new Date(rule.basis === 'purchase' ? purchasedAt : issuedAt);
  from.setMonth(from.getMonth() + rule.months);
  return from;
}

// ------------------------------------------------------------------ disruptions

/**
 * US DOT automatic refund rule, in effect since 2024-10-28: a cancelled flight,
 * or a "significant change" (3+ hours domestic, 6+ hours international), is
 * owed a refund to the original payment if the passenger doesn't accept the
 * rebooking or other compensation. It covers flights to, from and within the US.
 * Source: https://www.transportation.gov/individuals/aviation-consumer-protection/refunds
 */
export const DOT_DELAY_MIN = { domestic: 180, international: 360 } as const;

export const DISRUPTION_STEPS = [
  'If the airline rebooks you and you take the new flight, there is no refund: decide first.',
  'To get cash back, decline the rebooking and any credit offered, and ask for a refund to your original payment.',
  'Airlines must pay within 7 business days for card purchases. If they refuse, file at transportation.gov/airconsumer.',
  'Paid for a bag that arrived 12+ hours late (domestic), seats or Wi-Fi you didn’t get? Those fees are refundable too.',
];

export function owedRefund(status: { cancelled: boolean; delayMin: number | null; international: boolean }): boolean {
  if (status.cancelled) return true;
  const floor = status.international ? DOT_DELAY_MIN.international : DOT_DELAY_MIN.domestic;
  return status.delayMin != null && status.delayMin >= floor;
}
