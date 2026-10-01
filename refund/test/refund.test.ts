import { describe, it, expect } from 'vitest';

import { extractPurchase, totalFromText, orderRefFromText, toCents } from '@/lib/ingest/extract';
import { deadlineFor, fareClaimable, policyFor, policyForSender, worthAlerting, DEFAULT_SETTINGS } from '@/lib/policies';
import { splitLegs } from '@/lib/pricing/serpapi';
import type { NormalizedEmail } from '@/lib/types';

const email = (over: Partial<NormalizedEmail>): NormalizedEmail => ({
  from: 'x@example.com', subject: 'Your order', html: '', text: '', receivedAt: '2026-09-01T12:00:00Z', ...over,
});
const ld = (obj: unknown) => `<html><script type="application/ld+json">${JSON.stringify(obj)}</script></html>`;

describe('merchant detection', () => {
  it('matches sender domains and subdomains', () => {
    expect(policyForSender('Best Buy <BestBuyInfo@emailinfo.bestbuy.com>')?.id).toBe('bestbuy');
    expect(policyForSender('Delta Air Lines <DeltaAirLines@t.delta.com>')?.id).toBe('delta');
    expect(policyForSender('orders@walmart.com')).toBeUndefined();
  });
});

describe('schema.org extraction', () => {
  it('reads a retail Order with items, SKUs and total', () => {
    const p = extractPurchase(
      email({
        from: 'BestBuyInfo@emailinfo.bestbuy.com',
        html: ld({
          '@context': 'http://schema.org', '@type': 'Order', merchant: { name: 'Best Buy' },
          orderNumber: 'BBY01-806123', orderDate: '2026-09-01T10:00:00-07:00', price: '1,099.98', priceCurrency: 'USD',
          acceptedOffer: [
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Sony WH-1000XM6', sku: '6505727' }, price: '399.99', eligibleQuantity: { value: 1 } },
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'iPad Air', url: 'https://www.bestbuy.com/site/x?skuId=6565838' }, price: '699.99' },
          ],
        }),
      }),
      policyFor('bestbuy')!,
    )!;
    expect(p.confidence).toBe('high');
    expect(p.orderRef).toBe('BBY01-806123');
    expect(p.totalCents).toBe(109998);
    expect(p.items.map((i) => i.sku)).toEqual(['6505727', '6565838']);
    expect(p.items[0].unitPriceCents).toBe(39999);
  });

  it('reads FlightReservations: one segment per flight, passengers counted once', () => {
    const seg = (n: string, from: string, to: string, t: string, who: string) => ({
      '@type': 'FlightReservation', reservationNumber: 'ABC123', underName: { name: who },
      reservationFor: { '@type': 'Flight', flightNumber: n, airline: { iataCode: 'DL' }, departureAirport: { iataCode: from }, arrivalAirport: { iataCode: to }, departureTime: t },
    });
    const p = extractPurchase(
      email({
        from: 'DeltaAirLines@t.delta.com',
        html: ld([
          seg('123', 'SFO', 'JFK', '2026-11-20T08:00:00-08:00', 'Passenger A'),
          seg('123', 'SFO', 'JFK', '2026-11-20T08:00:00-08:00', 'Passenger B'),
          seg('456', 'JFK', 'SFO', '2026-11-27T18:00:00-05:00', 'Passenger A'),
          seg('456', 'JFK', 'SFO', '2026-11-27T18:00:00-05:00', 'Passenger B'),
        ]),
        text: 'Main Cabin\nTrip Total\n$812.40',
      }),
      policyFor('delta')!,
    )!;
    expect(p.kind).toBe('flight');
    expect(p.orderRef).toBe('ABC123');
    expect(p.details.passengers).toBe(2);
    expect((p.details.segments as unknown[]).length).toBe(2);
    expect(p.details.fare_brand).toBe('Main Cabin');
    expect(p.totalCents).toBe(81240);
  });

  it('reads a LodgingReservation and whether it is refundable', () => {
    const p = extractPurchase(
      email({
        from: 'reservations@marriott.com',
        html: ld({
          '@type': 'LodgingReservation', reservationNumber: '7781', totalPrice: '642.10',
          reservationFor: { '@type': 'LodgingBusiness', name: 'Hotel Zephyr', address: { addressLocality: 'San Francisco' } },
          checkinTime: '2026-12-01T15:00:00', checkoutTime: '2026-12-03T11:00:00',
        }),
        text: 'Free cancellation until Nov 29',
      }),
      policyFor('hotel')!,
    )!;
    expect(p.details).toMatchObject({ property: 'Hotel Zephyr', city: 'San Francisco', refundable: true });
    expect(p.totalCents).toBe(64210);
  });
});

describe('text fallback', () => {
  it('prefers order totals over a bare Total, ignores subtotals', () => {
    expect(totalFromText('Subtotal $90.00\nTotal $95.00\nOrder Total\n$97.42')).toBe(9742);
  });
  it('finds order numbers', () => {
    expect(orderRefFromText('Thanks! Order #: 102-4433-9981', 'retail')).toBe('102-4433-9981');
  });
  it('is always low confidence', () => {
    const p = extractPurchase(email({ from: 'orders@oe.target.com', subject: 'Thanks for your order!', text: 'Order #102000111\nOrder total $54.10' }), policyFor('target')!)!;
    expect(p.confidence).toBe('low');
    expect(p.totalCents).toBe(5410);
  });
  it('ignores marketing', () => {
    expect(extractPurchase(email({ from: 'deals@target.com', subject: 'Deals of the week: 30% off', text: 'Order total $10.00' }), policyFor('target')!)).toBeNull();
  });
  it('parses money', () => {
    expect(toCents('$1,234.5')).toBe(123450);
    expect(toCents('free')).toBeUndefined();
  });
});

describe('policies', () => {
  const bought = new Date('2026-09-01T12:00:00Z');
  it('sets store windows', () => {
    const days = (id: string, tier?: 'plus') =>
      (deadlineFor(policyFor(id)!, bought, {}, { bestbuyTier: tier })!.getTime() - bought.getTime()) / 86_400_000;
    expect(days('target')).toBe(14);
    expect(days('costco')).toBe(30);
    expect(days('bestbuy')).toBe(15);
    expect(days('bestbuy', 'plus')).toBe(60);
  });
  it('flights close at departure; Southwest 10 minutes before', () => {
    const d = { segments: [{ departs: '2026-11-20T16:00:00Z' }] };
    expect(deadlineFor(policyFor('delta')!, bought, d)!.toISOString()).toBe('2026-11-20T16:00:00.000Z');
    expect(deadlineFor(policyFor('southwest')!, bought, d)!.toISOString()).toBe('2026-11-20T15:50:00.000Z');
  });
  it('Basic Economy is claimable only inside the 24-hour window', () => {
    const d = { fare_brand: 'Basic Economy', segments: [{ departs: '2026-11-20T16:00:00Z' }] };
    expect(fareClaimable(policyFor('delta')!, d, bought, new Date('2026-09-01T20:00:00Z')).ok).toBe(true);
    expect(fareClaimable(policyFor('delta')!, d, bought, new Date('2026-09-03T12:00:00Z')).ok).toBe(false);
    expect(fareClaimable(policyFor('delta')!, { ...d, fare_brand: 'Main Cabin' }, bought, new Date('2026-09-03T12:00:00Z')).ok).toBe(true);
  });
  it('alerts only when both floors clear', () => {
    expect(worthAlerting('retail', 4000, 2800, DEFAULT_SETTINGS)).toBe(true);    // $12, 30%
    expect(worthAlerting('retail', 90000, 88800, DEFAULT_SETTINGS)).toBe(false); // $12, but only 1.3%
    expect(worthAlerting('retail', 4000, 3500, DEFAULT_SETTINGS)).toBe(false);   // $5 < $10
    expect(worthAlerting('flight', 80000, 76000, DEFAULT_SETTINGS)).toBe(true);  // $40, 5%
  });
});

describe('trip legs', () => {
  it('splits legs at gaps over 12 hours (multi-city too)', () => {
    const { legs, back } = splitLegs([
      { from: 'MCO', to: 'PHL', departs: '2026-11-24T12:00:00Z' },
      { from: 'PHL', to: 'SFO', departs: '2026-11-28T15:00:00Z' },
    ]);
    expect(legs.length).toBe(2);
    expect(back.map((s) => s.to)).toEqual(['SFO']);
  });
  it('keeps connections in one leg', () => {
    const { out, back } = splitLegs([
      { from: 'SFO', to: 'DEN', departs: '2026-11-20T08:00:00Z' },
      { from: 'DEN', to: 'JFK', departs: '2026-11-20T12:00:00Z' },
      { from: 'JFK', to: 'SFO', departs: '2026-11-27T18:00:00Z' },
    ]);
    expect(out.map((s) => s.to)).toEqual(['DEN', 'JFK']);
    expect(back.map((s) => s.to)).toEqual(['SFO']);
  });
});

import { emailRole } from '@/lib/ingest/extract';

describe('email roles (from real subjects)', () => {
  it('only confirmations and receipts create purchases', () => {
    expect(emailRole('Your United Airlines booking confirmation – K54FEG')).toBe('purchase');
    expect(emailRole('Your trip confirmation (MCO - PHL)')).toBe('purchase');
    expect(emailRole('Thanks for your order!')).toBe('purchase');
    expect(emailRole('What to know about your trip to San Francisco')).toBe('update');
    expect(emailRole('Quick reminders about your upcoming trip to San Diego')).toBe('update');
    expect(emailRole('Trip on hold - GHZXBP')).toBe('update');
    expect(emailRole('AAdvantage® login verification')).toBe('other');
    expect(emailRole('Your Account Summary—Stay Near the Action')).toBe('other');
  });
});

import { pacingDays } from '@/lib/budget';
import { nextCheckAt } from '@/lib/schedule';

describe('SerpApi pacing', () => {
  it('runs daily when the budget covers it, and stretches when it does not', () => {
    expect(pacingDays(100, 10, 5)).toBe(1);        // 10/day available, 5 needed
    expect(pacingDays(100, 10, 25)).toBe(2.5);     // 10/day available, 25 needed
    expect(pacingDays(0, 10, 5)).toBe(Infinity);   // nothing left this month
  });

  it('checks flights daily until departure, stretched only by pacing', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const p = { purchased_at: '2026-09-01T12:00:00Z', deadline_at: '2026-10-20T16:00:00Z', details: { fare_brand: 'Main Cabin' } };
    const day = (d: Date | null) => (d!.getTime() - now.getTime()) / 86_400_000;
    expect(day(nextCheckAt(policyFor('delta')!, p, now, 1))).toBe(1);
    expect(day(nextCheckAt(policyFor('delta')!, p, now, 3))).toBe(3);
    // Far out: twice the pace.
    expect(day(nextCheckAt(policyFor('delta')!, { ...p, deadline_at: '2027-03-01T00:00:00Z' }, now, 2))).toBe(4);
  });

  it('never spends searches on fares that cannot be claimed', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const basic = { purchased_at: '2026-09-01T12:00:00Z', deadline_at: '2026-10-20T16:00:00Z', details: { fare_brand: 'Basic Economy' } };
    expect(nextCheckAt(policyFor('delta')!, basic, now)).toBeNull();
    expect(nextCheckAt(policyFor('hotel')!, { ...basic, details: { refundable: false } }, now)).toBeNull();
  });
});

import { creditExpiry, creditRuleFor, owedRefund } from '@/lib/policies';
import { parseStatus } from '@/lib/providers/aerodatabox';

describe('travel credits', () => {
  const bought = new Date('2026-03-10T12:00:00Z');
  it('Delta counts a year from the ORIGINAL purchase, not the claim', () => {
    const rule = creditRuleFor('delta')!;
    expect(rule.rule).toBe('book_by');
    expect(creditExpiry(rule, bought, new Date('2026-09-01T00:00:00Z')).toISOString().slice(0, 10)).toBe('2027-03-10');
  });
  it('United counts from issue and is travel-by', () => {
    const rule = creditRuleFor('united')!;
    expect(rule.rule).toBe('travel_by');
    expect(creditExpiry(rule, bought, new Date('2026-09-01T00:00:00Z')).toISOString().slice(0, 10)).toBe('2027-09-01');
  });
  it('Southwest: Basic is 6 months, Choice 12, Preferred pays cash (no credit)', () => {
    expect(creditRuleFor('southwest', 'Basic')!.months).toBe(6);
    expect(creditRuleFor('southwest', 'Choice')!.months).toBe(12);
    expect(creditRuleFor('southwest', 'Choice Preferred')).toBeNull();
  });
});

describe('flight disruptions (DOT rule)', () => {
  it('cancellations always qualify; delays at 3h domestic, 6h international', () => {
    expect(owedRefund({ cancelled: true, delayMin: null, international: false })).toBe(true);
    expect(owedRefund({ cancelled: false, delayMin: 179, international: false })).toBe(false);
    expect(owedRefund({ cancelled: false, delayMin: 180, international: false })).toBe(true);
    expect(owedRefund({ cancelled: false, delayMin: 300, international: true })).toBe(false);
    expect(owedRefund({ cancelled: false, delayMin: 360, international: true })).toBe(true);
  });
  it('reads status, arrival delay and whether the flight crossed a border', () => {
    const st = parseStatus([
      { status: 'Arrived', departure: { airport: { iata: 'AAA', countryCode: 'US' }, scheduledTime: { utc: '2026-11-24 15:00Z' } },
        arrival: { airport: { iata: 'BBB', countryCode: 'US' }, scheduledTime: { utc: '2026-11-24 17:30Z' }, runwayTime: { utc: '2026-11-24 21:00Z' } } },
    ], 'AAA')!;
    expect(st).toMatchObject({ cancelled: false, delayMin: 210, international: false });
    expect(parseStatus([{ status: 'Canceled' }])!.cancelled).toBe(true);
  });
});

import { returnBy } from '@/lib/policies';

describe('return windows', () => {
  const bought = new Date('2026-09-01T12:00:00Z');
  const days = (d: Date | null) => (d ? (d.getTime() - bought.getTime()) / 86_400_000 : null);
  it('uses each store’s window, and the Best Buy tier', () => {
    expect(days(returnBy(policyFor('target')!, bought))).toBe(90);
    expect(days(returnBy(policyFor('bestbuy')!, bought))).toBe(15);
    expect(days(returnBy(policyFor('bestbuy')!, bought, { bestbuyTier: 'total' }))).toBe(60);
  });
  it('has no date where the store sets no limit, or for flights', () => {
    expect(returnBy(policyFor('costco')!, bought)).toBeNull();
    expect(returnBy(policyFor('delta')!, bought)).toBeNull();
  });
});
