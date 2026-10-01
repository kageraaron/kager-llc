import { describe, expect, it } from 'vitest';
import { looseItinerary } from '@/lib/ingest/itinerary';
import { extractPurchase } from '@/lib/ingest/extract';
import { policyFor } from '@/lib/policies';
import { fillGaps, restate } from '@/lib/scan';
import { readFlightReceipt } from '@/lib/ingest/itinerary';
import { emailRole } from '@/lib/ingest/extract';

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
Class: United Economy (Q)
Thu, Apr 08, 2027
Thu, Apr 08, 2027
09:30 PM
11:06 PM
San Francisco, CA, US (SFO)
Ontario, CA, US (ONT)
Flight 2 of 2 UA1375
Class: United First (P)
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
/** Just the flight, without the cabin read beside it. */
const core = (segs: { carrier?: string; flight?: string; from?: string; to?: string; departs?: string }[]) =>
  segs.map(({ carrier, flight, from, to, departs }) => ({ carrier, flight, from, to, departs }));

describe('reading an itinerary without knowing its layout', () => {
  it('reads a layout where the details follow the flight number', () => {
    expect(core(looseItinerary(receipt))).toEqual(want);
  });

  it('reads a layout where the details come before it', () => {
    expect(core(looseItinerary(booking))).toEqual(want);
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

  it('reads a total written with a currency code and no dollar sign', () => {
    const plain = { ...email, text: receipt.replace('$342.20 USD', '342.20 USD') };
    expect(extractPurchase(plain, policyFor('united')!)!.totalCents).toBe(34220);
  });

  it('reads the message once when it arrives as both HTML and text', () => {
    // Both parts carry the same receipt; counting both doubled the travellers and the fare.
    const both = { ...email, html: `<table>${receipt.split('\n').map((l) => `<tr><td>${l}</td></tr>`).join('')}</table>` };
    const p = extractPurchase(both, policyFor('united')!)!;
    expect(p.details.passengers).toBe(1);
    expect(p.totalCents).toBe(34220);
    expect((p.details.segments as unknown[]).length).toBe(2);
  });

  it('becomes a purchase with its flights and total, for a person to confirm', () => {
    const p = extractPurchase(email, policyFor('united')!)!;
    expect(p.confidence).toBe('low');
    expect(p.orderRef).toBe('ABC123');
    expect(p.totalCents).toBe(34220);
    expect(core(p.details.segments as never)).toEqual(want);
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

/**
 * Twelve real bookings were checked against their emails by hand. The flights
 * were right; these are the things that were not, each rebuilt with made-up
 * names and numbers.
 */
describe('what a hand check of real bookings corrected', () => {
  /** Two travellers, an upgrade bought later, and a flight credit applied. */
  const twoUp = `Thu, Jan 29, 2026
Confirmation Number:
ABC123
Flight 1 of 2 UA968
Class: United Polaris business (P)
Sat, Jul 18, 2026
Sun, Jul 19, 2026
02:50 PM
10:20 AM
San Francisco, CA, US (SFO)
Amsterdam, NL (AMS)
Flight 2 of 2 UA195
Class: United Economy (Q)
Sun, Aug 02, 2026
Sun, Aug 02, 2026
11:45 AM
02:20 PM
Munich, DE (MUC)
San Francisco, CA, US (SFO)
Traveler Details
EXAMPLE/PAT
eTicket number: 0162300000001
Seats: SFO-AMS 03D
MUC-SFO 30G
EXAMPLE/SAM
eTicket number: 0162300000002
Seats: SFO-AMS 03F
MUC-SFO 30F
Purchase Summary
Date of purchase:
Wed, Jan 21, 2026
Airfare:
1733.00
Total Per Passenger:
1936.43 USD
Total:
3872.86 USD
Additional Purchase Summary
Date of purchase:
Thu, Jan 29, 2026
Mileageplus Business First Upgrade Fee:
425.00
Total:
425.00 USD
Basic Economy tickets are not eligible for changes.`;

  it('counts travellers by their seat rows', () => {
    expect(readFlightReceipt(twoUp).passengers).toBe(2);
    expect(readFlightReceipt(receipt).passengers).toBe(1);
  });

  it('takes the fare for everyone, not one passenger and not a later upgrade', () => {
    expect(readFlightReceipt(twoUp).totalCents).toBe(387286);
  });

  it('measures against the fare before a flight credit, not the cash paid', () => {
    const credit = receipt.replace('Total:\n$342.20 USD', 'Total Per Passenger:\n564.57 USD\nFuture flight credit applied:\n-193.09 USD\nTotal:\n371.48 USD');
    expect(readFlightReceipt(credit).totalCents).toBe(56457);
  });

  it('takes the fare type from the cabin beside the flight, not the fine print', () => {
    // "Basic Economy" appears in the boilerplate of every airline email.
    expect(readFlightReceipt(twoUp).fareBrand).toBe('United Polaris business');
    expect(readFlightReceipt(booking).fareBrand).toBe('United Economy');
  });

  it('knows a Basic Economy ticket by its booking class', () => {
    const basic = receipt.replace('United Economy (Q)', 'United Economy (N)');
    expect(readFlightReceipt(basic).fareBrand).toBe('Basic Economy');
  });

  it('uses the stated date of purchase when a receipt is re-sent later', () => {
    expect(readFlightReceipt(twoUp).purchasedOn).toBe('2026-01-21');
  });

  it('flags tickets paid in miles, and exchanges with no new airfare', () => {
    expect(readFlightReceipt(receipt.replace('$342.20 USD', '90,000 miles + 22.40 USD')).award).toBe(true);
    expect(readFlightReceipt(receipt.replace('$310.00', '0.00')).award).toBe(true);
    expect(readFlightReceipt(receipt.replace('(Q)', '(XN)')).award).toBe(true);
    expect(readFlightReceipt(twoUp).award).toBe(false);
  });

  /** A schedule change prints the old flight and time, then the new ones. */
  const changed = `If this new schedule works with your travel plans, you're all set.
Flight to Orlando
November 21, 2026
November 22, 2026
UA 1947 UA 1331 operated by United Airlines
10:35 pm
6:51 am
SFO
5H, 16M
MCO
San Francisco
Orlando
United Economy (Q)
Flight to San Francisco
November 27, 2026
November 27, 2026
UA 1350 operated by United Airlines
5:45 pm 4:34 pm
9:10 pm 7:59 pm
FLL
6H, 25M
SFO
Confirmation number: ABC123
Travelers
Traveler 1`;

  it('reads the NEW flights and times from a schedule change', () => {
    expect(core(looseItinerary(changed))).toEqual([
      { carrier: 'UA', flight: '1331', from: 'SFO', to: 'MCO', departs: '2026-11-21T22:35:00' },
      { carrier: 'UA', flight: '1350', from: 'FLL', to: 'SFO', departs: '2026-11-27T16:34:00' },
    ]);
  });

  it('tells a ticket from what happens to it afterwards', () => {
    expect(emailRole('eTicket Itinerary and Receipt for Confirmation ABC123')).toBe('purchase');
    expect(emailRole('Seat Purchase Confirmation')).toBe('update');
    expect(emailRole('The schedule for your trip to Orlando has changed')).toBe('schedule');
    expect(emailRole('Your flight cancellation is complete')).toBe('cancelled');
    expect(emailRole("You've received a future flight credit from United")).toBe('cancelled');
  });

  it('lets a better read replace a worse one while nobody has confirmed it', () => {
    const worse = { segments: want, passengers: 1, fare_brand: 'Basic Economy' };
    const better = { segments: want, passengers: 2, fare_brand: 'United Economy' };
    expect(restate(worse, better)).toMatchObject({ passengers: 2, fare_brand: 'United Economy' });
  });

  it('keeps the full itinerary when a later layout shows fewer legs', () => {
    expect(restate({ segments: want }, { segments: [want[1]] }).segments).toEqual(want);
  });
});
