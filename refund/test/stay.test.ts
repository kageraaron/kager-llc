import { describe, expect, it } from 'vitest';
import { propertyFromSubject, readStay } from '@/lib/ingest/stay';
import { roomKind, sameRoom } from '@/lib/pricing/serpapi';
import { emailRole, extractPurchase, orderRefFromText } from '@/lib/ingest/extract';
import { policyFor, policyForSender } from '@/lib/policies';

/**
 * Four hotel chains, four layouts, one reader. Each fixture is a real
 * confirmation's shape with a made-up property, guest and numbers.
 */

const received = '2026-07-06T17:00:00Z';

/** A range of dates over three lines; total labelled "*Total charges". */
const rangeOverLines = `Thank you for booking with Harbor Suites Bayfront.
Pat, your reservation is confirmed!
Confirmation #61234567
Harbor Suites Bayfront
Dates
24 Mar 2027
-
29 Mar 2027
Check in 4:00 pm / Check out
11:00 am
Reservation
1 Room,
1 Adult
Rate
5 nights stay
2,828.00 USD
Taxes
367.64 USD
*Total charges
3,195.64 USD
Cancellation Policy:
Canceling your reservation before 6:00 PM (local hotel time) on Tuesday, 23 March, 2027 will result in no charge.`;

/** Labels with the value on the next line; a prepaid rate. */
const labelsAbove = `Thank you for your booking, Pat Example.
Sat, Jan 25, 2027 – Sun, Jan 26, 2027
Confirmation Number: 98765432
Check-In:
Monday, January 25, 2027
03:00 PM
Check-Out:
Tuesday, January 26, 2027
12:00 PM
Number of rooms
1 Room
Total for Stay (all rooms)
78.75 EUR
Member Rate Advance Purchase, prepay in full, see Rate details`;

/** Day-month-year with dashes; no total stated. */
const dashedDates = `Reservation Details
Confirmation #
45678901
Guest Name
Pat Example
Check-in
Thursday, 15-Jan-2027
Check-Out
Monday, 19-Jan-2027
Nightly rate per room
January 15 - 821.10 US DOLLARS`;

/** A range in prose; "up to N days prior" instead of a date; currency before the amount. */
const proseRange = `Reservation n° QWERTYUI
Your reservation is confirmed
Date of stay: From 27 Jul 2027 to 28 Jul 2027
Hotel Lindenhof Schwabing
FLEXIBLE RATE
Total price of stay
Total
EUR 94.50
(fees and taxes included)
Cancellation Policy
No cancellation charge applies up to 1 day prior to arrival. Thereafter, the first night will be charged.`;

describe('reading a stay without knowing the chain', () => {
  it('reads a date range laid out over lines, the total and the free-cancellation deadline', () => {
    expect(readStay(rangeOverLines, 'Your reservation at Harbor Suites Bayfront is confirmed. 61234567 - 24 Mar 2027', received)).toEqual({
      property: 'Harbor Suites Bayfront',
      checkIn: '2027-03-24',
      checkOut: '2027-03-29',
      totalCents: 319564,
      currency: 'USD',
      refundable: true,
      cancelBy: '2027-03-23',
    });
  });

  it('reads labelled check-in and check-out, a euro total, and a prepaid rate', () => {
    expect(readStay(labelsAbove, 'Reservation Confirmation #98765432 for Courtyard Lindenhof', received)).toMatchObject({
      property: 'Courtyard Lindenhof',
      checkIn: '2027-01-25',
      checkOut: '2027-01-26',
      totalCents: 7875,
      currency: 'EUR',
      refundable: false,
    });
  });

  it('reads day-month-year dates and leaves a missing total missing', () => {
    const s = readStay(dashedDates, 'Reservation Details for Your Upcoming Stay at Seaglass Resort', received);
    expect(s).toMatchObject({ property: 'Seaglass Resort', checkIn: '2027-01-15', checkOut: '2027-01-19' });
    expect(s.totalCents).toBeUndefined();
  });

  it('reads a range in prose and works out "1 day prior to arrival"', () => {
    expect(readStay(proseRange, 'Confirmation of your reservation: Hotel Lindenhof Schwabing No.QWERTYUI', received)).toMatchObject({
      property: 'Hotel Lindenhof Schwabing',
      checkIn: '2027-07-27',
      checkOut: '2027-07-28',
      totalCents: 9450,
      currency: 'EUR',
      refundable: true,
      cancelBy: '2027-07-26',
    });
  });

  it('reads a European decimal comma', () => {
    const s = readStay(`${dashedDates}\nTotal\n250,41 EUR`, 'Pat, Your reservation number is 2ABC4D35', received);
    expect(s).toMatchObject({ totalCents: 25041, currency: 'EUR' });
  });

  it('does not take the check-in time row, or the email date, for the nights', () => {
    const s = readStay(rangeOverLines, 'x', received);
    expect([s.checkIn, s.checkOut]).toEqual(['2027-03-24', '2027-03-29']);
  });
});

describe('telling a hotel booking from the mail around it', () => {
  it('names the property from the subject', () => {
    expect(propertyFromSubject('Your reservation at Hotel Example Brickell has been modified. 12345678 - 27 Mar 2027')).toBe('Hotel Example Brickell');
    expect(propertyFromSubject('Your Super.com Booking Confirmation for Best Example Plus Hotel')).toBe('Best Example Plus Hotel');
    expect(propertyFromSubject('Check-In Instructions for Example Inn')).toBeUndefined();
  });

  it('recognises how hotels word a confirmation, a change and a cancellation', () => {
    expect(emailRole('Your reservation at Harbor Suites Bayfront is confirmed. 61234567 - 24 Mar 2027')).toBe('purchase');
    expect(emailRole('Your reservation at Hotel Example Brickell has been modified. 12345678')).toBe('purchase');
    expect(emailRole('Confirmation of your reservation: Hotel Lindenhof Schwabing No.QWERTYUI')).toBe('purchase');
    expect(emailRole('Your Reservation Cancellation # 12345678 at Hotel Example.')).toBe('cancelled');
    expect(emailRole('Check-In Instructions for Example Inn')).toBe('update');
    expect(emailRole('Tell us about your stay at Example Inn')).toBe('other');
  });

  it('knows the domains chains really send reservations from', () => {
    expect(policyForSender('Marriott <reservations@res-marriott.com>')?.id).toBe('hotel');
    expect(policyForSender('IHG <IHGOneRewards@tx.ihg.com>')?.id).toBe('hotel');
    expect(policyForSender('ALL <no-reply@confirmation.all.com>')?.id).toBe('hotel');
  });

  it('does not take an ordinary word for an order number', () => {
    // A real card read "your Order of The Stay … Early check-in" as order number EARLY.
    expect(orderRefFromText('Re: your Order of The Stay initiation. Early check-in is available.', 'hotel')).toBeUndefined();
    expect(orderRefFromText('Confirmation #61234567', 'hotel')).toBe('61234567');
    expect(orderRefFromText('Reservation n° QWERTYUI', 'hotel')).toBe('QWERTYUI');
    expect(orderRefFromText('Confirmation Number:\nABC123', 'flight')).toBe('ABC123');
  });

  it('turns a confirmation into a stay to review, and ignores mail with no property or nights', () => {
    const email = { from: 'IHG <x@tx.ihg.com>', subject: 'Your reservation at Harbor Suites Bayfront is confirmed. 61234567 - 24 Mar 2027', html: '', text: rangeOverLines, receivedAt: received };
    const p = extractPurchase(email, policyFor('hotel')!)!;
    expect(p).toMatchObject({ kind: 'hotel', merchantName: 'Harbor Suites Bayfront', orderRef: '61234567', totalCents: 319564, confidence: 'low' });
    expect(p.details).toMatchObject({ property: 'Harbor Suites Bayfront', check_in: '2027-03-24', check_out: '2027-03-29', refundable: true, cancel_by: '2027-03-23' });

    const noise = { ...email, subject: 'Re: your Order of The Stay initiation', text: 'Thanks for your order. Early check-in may be available. Total: $20.00' };
    expect(extractPurchase(noise, policyFor('hotel')!)).toBeNull();
  });
});

describe('two more layouts found on real mail', () => {
  /** European dates with dots, "Arrival Time" labels, a decimal comma, the hotel named only in prose. */
  const dotted = `It is our pleasure to confirm your stay at Parkhaus Hotel Amstel from 21.07.2027 to 23.07.2027. Thank you.
RESERVATION SUMMARY HOTEL GUARANTEE & RESERVATION POLICIES
Reservation Number:
2ABC4D35
Adults:
2
Arrival Time:
21.07.2027
Check-In Time:
15:00
Departure Time:
23.07.2027
Check Out Time:
12:00
Sub Total:
495,04 EUR
Total price:
660,88 EUR Additional taxes and surcharges may apply.
Cancellation Policy:
Cancel by 14:00:00 hotel time on 21 July 2027. Late cancel or no show will be charged = 250,41 EUR.`;

  it('reads dotted European dates, a decimal comma and a hotel named only in the body', () => {
    expect(readStay(dotted, 'Pat, Your reservation number is 2ABC4D35', received)).toMatchObject({
      property: 'Parkhaus Hotel Amstel',
      checkIn: '2027-07-21',
      checkOut: '2027-07-23',
      totalCents: 66088,
      currency: 'EUR',
      refundable: true,
      cancelBy: '2027-07-21',
    });
  });

  /** A booking site: city in the headline, "fully covered until", an underscore in the reference, no total. */
  const agency = `Your booking at Best Example Plus Hotel in Palm Springs is confirmed
Check-In
Fri Apr 09, 2027
Check-Out
Mon Apr 12, 2027
Booking Details
Confirmation Number: B_59771963
Cancellation Policy
Refund Policy Flexibility:
Your booking is fully covered until Apr 06, 2027.
To initiate a cancellation, please verify your refund eligibility.`;

  it('reads the city, a "covered until" deadline and a reference with an underscore', () => {
    expect(readStay(agency, 'Your Super.com Booking Confirmation for Best Example Plus Hotel', received)).toMatchObject({
      property: 'Best Example Plus Hotel',
      city: 'Palm Springs',
      checkIn: '2027-04-09',
      checkOut: '2027-04-12',
      refundable: true,
      cancelBy: '2027-04-06',
    });
    expect(orderRefFromText(agency, 'hotel')).toBe('B_59771963');
  });

  it('skips a bare "Total" heading to the row that has the amount', () => {
    const s = readStay(`${proseRange.replace('Total price of stay\nTotal\nEUR 94.50', 'Total\nYour stay\n1 night\nTotal price of stay\nTotal\nEUR 94.50')}`, 'x', received);
    expect(s.totalCents).toBe(9450);
  });
});

describe('comparing the same room, not the cheapest one', () => {
  // The room types one real hotel listed for one stay; the booking was a two-bedroom suite.
  const listed = [
    '1 king bed studio suite balcony - Best flexible rate',
    '1 king 1 bdrm suite high floor balcony - Best flexible rate',
    '1 queen bed 1 bedroom suite balcony - Best flexible rate',
    '1 king 1 bdrm oversized suite balcony - Best flexible rate',
    'Studio Suite, Balcony',
  ];
  const booked = '1 King 1 Qn 2 Bdrm Suite Balcony';

  it('reads the room off the confirmation', () => {
    const s = readStay(`${rangeOverLines}\nRoom details\n${booked}\nRate`, 'x', received);
    expect(s.room).toBe(booked);
  });

  it('understands how hotels abbreviate a room', () => {
    expect(roomKind(booked)).toEqual({ bedrooms: 2, beds: ['king', 'queen'] });
    expect(roomKind('Studio Suite, 1 King Bed, Balcony')).toEqual({ bedrooms: 0, beds: ['king'] });
    expect(roomKind('Two Bedroom Suite with Balcony').bedrooms).toBe(2);
    expect(roomKind('Deluxe Room, Guest room, 2 Twin/Single Bed(s)')).toEqual({ bedrooms: null, beds: ['twin'] });
  });

  it('finds no match for a two-bedroom suite among studios and one-bedrooms', () => {
    // This is the case that produced a false $748 "saving".
    expect(listed.filter((r) => sameRoom(booked, r))).toEqual([]);
  });

  it('matches the same number of bedrooms however it is spelled', () => {
    expect(sameRoom('1 King 1 Bdrm Suite', '1 queen bed 1 bedroom suite balcony - Best flexible rate')).toBe(true);
    expect(sameRoom(booked, 'Two Bedroom Suite, 1 King and 1 Queen, Balcony')).toBe(true);
    expect(sameRoom('Studio Suite, Balcony', '1 king bed studio suite balcony')).toBe(true);
  });

  it('falls back to bed types when neither name gives bedrooms', () => {
    expect(sameRoom('Deluxe Room, 1 King Bed', 'Deluxe King Room, City View')).toBe(true);
    expect(sameRoom('Deluxe Room, 1 King Bed', 'Deluxe Room, 2 Queen Beds')).toBe(false);
  });
});
