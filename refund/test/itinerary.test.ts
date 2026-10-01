import { describe, expect, it } from 'vitest';
import { looseItinerary } from '@/lib/ingest/itinerary';
import { extractPurchase } from '@/lib/ingest/extract';
import { policyFor } from '@/lib/policies';
import { fillGaps } from '@/lib/scan';

/**
 * Two layouts of one airline's itinerary, rebuilt with made-up flights. The
 * reader knows neither: it anchors on each flight number and reads around it.
 */

/** Receipt layout: the details FOLLOW the flight number. */
const receipt = `Fri, Sep 11, 2026
Thank you for choosing Example Air.
A receipt of your purchase is shown below.
Confirmation Number:
ABC123
Flight 1 of 2 UA552
Class: United Economy (XN)
Thu, Apr 08, 2027
Thu, Apr 08, 2027
09:30 PM
11:06 PM
San Francisco, CA, US (SFO)
Ontario, CA, US (ONT)
Flight 2 of 2 UA1375
Class: United First (IN)
Mon, Apr 12, 2027
Mon, Apr 12, 2027
01:33 PM
03:02 PM
Ontario, CA, US (ONT)
San Francisco, CA, US (SFO)
Traveler Details
EXAMPLE/PAT
Airfare:
$310.00
Total:
$342.20 USD
Fare rules: UA552 UA1375 NON-END/-TRAN`;

/** Booking layout: the details come BEFORE the flight number, airports on their own lines. */
const booking = `Thanks for booking
Confirmation number
ABC123
Fare
$310.00
Total
$342.20
Flight to Ontario
Apr 8, 2027
Nonstop
9:30 PM
11:06 PM
SFO
1h 36m
ONT
San Francisco, CA, US
Ontario, CA, US
FLIGHT INFO
Duration: 1h 36m
UA 552
Boeing 737 MAX 9
United Economy
Flight to San Francisco
Apr 12, 2027
Nonstop
1:33 PM
3:02 PM
ONT
1h 29m
SFO
Ontario, CA, US
San Francisco, CA, US
FLIGHT INFO
Duration: 1h 29m
UA 1375
Boeing 737 MAX 9
United First
Travelers
Pat Example`;

const want = [
  { carrier: 'UA', flight: '552', from: 'SFO', to: 'ONT', departs: '2027-04-08T21:30:00' },
  { carrier: 'UA', flight: '1375', from: 'ONT', to: 'SFO', departs: '2027-04-12T13:33:00' },
];

describe('reading an itinerary without knowing its layout', () => {
  it('reads a layout where the details follow the flight number', () => {
    expect(looseItinerary(receipt)).toEqual(want);
  });

  it('reads a layout where the details come before it', () => {
    expect(looseItinerary(booking)).toEqual(want);
  });

  it('counts each flight once, however often it is mentioned', () => {
    expect(looseItinerary(receipt)).toHaveLength(2);
  });

  it('does not take the email date, a currency or a fare code for an airport or a flight', () => {
    const segs = looseItinerary(receipt);
    expect(segs.flatMap((s) => [s.from, s.to])).not.toContain('USD');
    expect(segs.map((s) => s.departs?.slice(0, 10))).not.toContain('2026-09-11');
  });

  it('finds nothing in mail with no flights', () => {
    expect(looseItinerary('Your order has shipped.\nTotal: $20.00\nArrives May 3, 2027')).toEqual([]);
    expect(looseItinerary('MileagePlus statement\nUA 1234 miles expiring')).toEqual([]);
  });
});

describe('an airline confirmation with no structured markup', () => {
  const email = {
    from: 'United Airlines <Receipts@united.com>',
    subject: 'eTicket Itinerary and Receipt for Confirmation ABC123',
    html: '',
    text: receipt,
    receivedAt: '2026-09-11T17:00:00Z',
  };

  it('finds the total when blank lines separate the label from the amount', () => {
    const gappy = { ...email, text: '', html: `<table>${receipt.split('\n').map((l) => `<tr><td>${l}</td></tr><tr><td></td></tr>`).join('')}</table>` };
    expect(extractPurchase(gappy, policyFor('united')!)!.totalCents).toBe(34220);
  });

  it('becomes a purchase with its flights and total, for a person to confirm', () => {
    const p = extractPurchase(email, policyFor('united')!)!;
    expect(p.confidence).toBe('low');
    expect(p.orderRef).toBe('ABC123');
    expect(p.totalCents).toBe(34220);
    expect(p.details.segments).toEqual(want);
    expect(p.details.award).toBeUndefined();
  });

  it('marks a ticket paid in miles, where a cash fare drop means nothing', () => {
    const award = { ...email, text: receipt.replace('$342.20 USD', '90,000 miles + $11.20 USD') };
    expect(extractPurchase(award, policyFor('united')!)!.details.award).toBe(true);
  });
});

describe('filling gaps on a purchase already saved', () => {
  it('lets a later read supply flights the first one lacked', () => {
    const merged = fillGaps({ segments: [], passengers: 2, fare_brand: 'Basic Economy' }, { segments: want, passengers: 1, fare_brand: undefined });
    expect(merged).toEqual({ segments: want, passengers: 2, fare_brand: 'Basic Economy' });
  });

  it('takes a fuller itinerary that contains every flight already known', () => {
    expect(fillGaps({ segments: [want[0]] }, { segments: want }).segments).toEqual(want);
  });

  it('never replaces flights that are already known', () => {
    const known = [{ carrier: 'UA', flight: '1', from: 'SFO', to: 'EWR', departs: '2027-01-01T08:00:00' }];
    expect(fillGaps({ segments: known }, { segments: want }).segments).toEqual(known);
  });
});
