import type { RawEmailInput } from '@/lib/ingest/normalize';

/**
 * Representative ticket-confirmation emails, hand-built to match the real
 * structures each vendor sends. Bodies are trimmed to the parts the extractors
 * actually read; no real order numbers or personal data.
 *
 * When a real email fails to parse, add it here (scrubbed) and fix the
 * extractor against it - that is the intended workflow for this suite.
 */

/** Ticketmaster: ships schema.org EventReservation markup. */
export const ticketmasterJsonLd: RawEmailInput = {
  from: 'Ticketmaster <customer_support@email.ticketmaster.com>',
  subject: "Your Tickets for Japanese Breakfast",
  receivedAt: '2026-03-02T18:22:00Z',
  html: `<html><head>
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EventReservation",
  "reservationNumber": "38-41225/SF3",
  "bookingTime": "2026-03-02T18:20:11Z",
  "totalPrice": "128.50",
  "priceCurrency": "USD",
  "reservedTicket": {
    "@type": "Ticket",
    "ticketedSeat": { "seatSection": "GA", "seatRow": "-", "seatNumber": "-" }
  },
  "reservationFor": {
    "@type": "MusicEvent",
    "name": "Japanese Breakfast",
    "startDate": "2026-04-18T20:00:00-07:00",
    "url": "https://www.ticketmaster.com/event/1A006012BC3D4E5F",
    "performer": { "@type": "MusicGroup", "name": "Japanese Breakfast" },
    "location": {
      "@type": "MusicVenue",
      "name": "The Fillmore",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "addressCountry": "US"
      }
    }
  }
}
</script></head>
<body><p>Your order is confirmed.</p>
<a href="https://www.ticketmaster.com/event/1A006012BC3D4E5F">View tickets</a>
</body></html>`,
};

/** AXS: no structured markup, labelled text rows only. */
export const axsPlain: RawEmailInput = {
  from: '"AXS" <noreply@e.axs.com>',
  subject: 'Order Confirmation: Turnstile',
  receivedAt: '2026-02-11T02:05:00Z',
  html: `<html><body>
<table>
<tr><td>Thanks for your order!</td></tr>
<tr><td>Order Number: AXS-99120B</td></tr>
<tr><td>Fri, May 22, 2026 at 7:30 PM</td></tr>
<tr><td>Venue: The Wiltern, Los Angeles, CA</td></tr>
<tr><td>Order Total: $94.00</td></tr>
</table>
</body></html>`,
};

/** DICE: labelled block layout, own date format. */
export const dicePlain: RawEmailInput = {
  from: 'DICE <hello@mail.dice.fm>',
  subject: "You're going to Fontaines D.C.",
  receivedAt: '2026-01-20T11:40:00Z',
  html: `<html><body>
<div>Event</div><div>Fontaines D.C.</div>
<div>Venue</div><div>Brooklyn Steel</div>
<div>Date</div><div>14 June 2026, 8:00 PM</div>
<div>Booking reference: DICE7781QQ</div>
<div>Total: $61.20</div>
</body></html>`,
};

/** Eventbrite: JSON-LD, but a bare Event rather than a reservation. */
export const eventbriteJsonLd: RawEmailInput = {
  from: 'Eventbrite <noreply@order.eventbrite.com>',
  subject: 'Your tickets for Sunset Rollercoaster',
  receivedAt: '2026-05-01T09:00:00Z',
  html: `<html><head>
<script type="application/ld+json">
[{
  "@type": "Event",
  "name": "Sunset Rollercoaster - North America Tour",
  "startDate": "2026-08-09T19:00:00-04:00",
  "location": {
    "@type": "Place",
    "name": "Music Hall of Williamsburg",
    "address": { "addressLocality": "Brooklyn", "addressRegion": "NY", "addressCountry": "US" }
  },
  "performer": [{ "@type": "MusicGroup", "name": "Sunset Rollercoaster" }]
}]
</script></head><body>See you there.</body></html>`,
};

/**
 * A FORWARDED Ticketmaster confirmation — from a real failure.
 *
 * Three things broke at once here, and each would have hidden the show:
 *  1. The Gmail query had no subject pattern for "You Got Tickets To", and a
 *     forward's sender is a personal address, so it was never even fetched.
 *  2. Vendor extractors key off the sender domain, which a forward destroys.
 *  3. Gmail strips JSON-LD when forwarding, so the structured path was gone too.
 */
export const forwardedTicketmaster: RawEmailInput = {
  from: 'BENJAMIN STOLLMAN <ben@example.com>',
  subject: 'Fwd: You Got Tickets To Moby (18+)',
  receivedAt: '2026-08-28T23:22:00Z',
  html: `<div>---------- Forwarded message ---------<br>
From: Ticketmaster &lt;customer_support@email.ticketmaster.com&gt;<br>
Date: Wed, Aug 26, 2026 at 10:02 AM<br>
Subject: You Got Tickets To Moby (18+)<br>
To: &lt;someone@example.edu&gt;</div>
<div>My Account</div>
<div>Order Confirmed</div>
<div>Order # 54-48418/NCA</div>
<div>Moby (18+)</div>
<div>Thu &middot; Nov 05, 2026 &middot; 7:00 PM</div>
<div>Bill Graham Civic Auditorium &mdash; San Francisco, California</div>
<div>Payment Method VISA &mdash; 0925 Total: $199.60</div>`,
};

/** Not a ticket email. Must be rejected by every extractor. */
export const marketingNoise: RawEmailInput = {
  from: 'Ticketmaster <news@email.ticketmaster.com>',
  subject: 'Just announced: shows near you this spring',
  receivedAt: '2026-03-04T15:00:00Z',
  html: `<html><body>
<h1>Just Announced</h1>
<p>Tickets on sale Friday, March 6, 2026 at 10:00 AM.</p>
<p>Copyright 2026 Ticketmaster</p>
</body></html>`,
};

/** A shipping notice - the closest false-positive neighbour, since Shop-style keyword scans catch these. */
export const packageNoise: RawEmailInput = {
  from: 'Amazon <ship-confirm@amazon.com>',
  subject: 'Your order has shipped',
  receivedAt: '2026-03-05T12:00:00Z',
  html: `<html><body><p>Order Confirmation: 112-9988776</p>
<p>Arriving Tuesday, March 10, 2026</p></body></html>`,
};

/**
 * AXS purchase confirmation, from a real message.
 *
 * Two things here are load-bearing and both come from the real email:
 *
 *  1. The multipart TEXT part is a DEGRADED copy — the order-details table
 *     collapses to "Order details for **  *Quantity* ..." with the artist,
 *     venue and event date gone. Only the HTML carries the real line. Since the
 *     pipeline prefers `text` when present, an extractor reading only that
 *     returns the ORDER date as the event date.
 *  2. The time uses U+202F NARROW NO-BREAK SPACE before "PM", not a plain
 *     space. `\s` covers it in JS, but only if the body was decoded as UTF-8.
 */
export const axsOrderPresale: RawEmailInput = {
  from: 'AXS Guest Services <guestservices@axs.com>',
  subject: 'Thank you for your order for Chris Stussy -  Presale',
  receivedAt: '2026-01-27T18:08:27Z',
  text: `Dear Pat Rivera,

Thank you for your order. Your confirmation number is *40000000*. Please keep this number for future reference.

Order Date: Jan 27 2026 Billing & Shipping Address: Pat Rivera
1 Example St,
San Francisco, CA-94100
UNITED STATES

Order details for **  *Quantity* *Type* *Type* ** *Section* *Row* *Seats* *Price* *Total*

Sub Total: $240.00 :  :  :  : Grand Total: $311.64   Payment Amount Due: $0.00`,
  html: `<html><body>
<p>Thank you for your order. Your confirmation number is 40000000 .</p>
<table><tr><td>Order Date:</td><td>Jan 27 2026</td></tr></table>
<p>Order details for Chris Stussy - Presale at Shed A scheduled on 2/27/2026 6:00 PM</p>
<table>
  <tr><td>Quantity</td><td>Type</td><td>Price</td><td>Total</td></tr>
  <tr><td>4</td><td>Presale DP</td><td>$60.00</td><td>$240.00</td></tr>
</table>
<table>
  <tr><td>Sub Total:</td><td>$240.00</td></tr>
  <tr><td>Service Fees:</td><td>$71.64</td></tr>
  <tr><td>Grand Total:</td><td>$311.64</td></tr>
</table>
<p>Included Event(s)</p>
<p>Chris Stussy Admissions, 2/27/2026 6:00:00 PM</p>
</body></html>`,
};

/**
 * AXS ticket TRANSFER. A different shape from a purchase: no order number, no
 * price, and the event as three consecutive lines. Still a show you are going
 * to, so it must not be dropped.
 */
export const axsTransfer: RawEmailInput = {
  from: 'AXS Guest Services <guestservices@axs.com>',
  subject: 'You Received Tickets',
  receivedAt: '2026-05-03T03:53:48Z',
  text: `*You Received Tickets!*

Hi Sam,
You Received Tickets!

Alex transferred 3 tickets to you for the following event:

 *Sat* May 2, 2026 - 8:00 PM
Chris Lake - Admissions
Shed A, San Francisco, CA

Message from Alex:  Here's how to use your tickets:

1. Get the AXS mobile app.`,
  html: `<html><body><p>You Received Tickets!</p></body></html>`,
};

/**
 * See Tickets / Eventim guest-list confirmation. Previously matched the vendor
 * but produced no name at all, because the spec had no `specific` — so the
 * "needs at least one of artist/event/venue" guard rejected every one.
 */
export const seeTicketsGuestList: RawEmailInput = {
  from: 'See Tickets US <info@seetickets.us>',
  subject: 'Here Are Your Tickets for Shiba San',
  receivedAt: '2026-05-09T00:46:05Z',
  text: `May 8,2026

Rivera Pat,

You have been added to the guest list for Shiba San.

DJ Dials &amp; 1015 Folsom Present:

*Shiba San*

Friday, May 8, 2026

1015 Folsom

1015 Folsom St, San Francisco, CA

Show 10:00PM

Your Receipt

Order Number
AA0BB1CCDDEE2F

Order Date
05/08/2026 5:46:03 PM`,
};

/**
 * Frontgate festival receipt (Outside Lands). Frontgate had no extractor at
 * all, so these matched nothing. Also the multi-day case: the event is a DATE
 * RANGE, and it is filed under the first day.
 */
export const frontgateFestival: RawEmailInput = {
  from: 'Outside Lands <order-support@frontgatetickets.com>',
  subject: 'Your Outside Lands Receipt - Order #100000000',
  receivedAt: '2026-03-03T20:23:08Z',
  html: `<html><body>
<p>Order #100000000</p>
<p>Your Outside Lands order has been successfully processed.</p>
<p>Thank you for your purchase!</p>
<p>3-Day General Admission</p>
<p>Friday, August 7, 2026 - Sunday, August 9, 2026</p>
<p>at Golden Gate Park</p>
<p>San Francisco, CA</p>
<p> - 94121 </p>
<p>Doors at 11:00AM</p>
<table>
  <tr><td>3-Day General Admission Tier 1</td><td>2</td><td>$1018.00</td></tr>
</table>
<p>Event Subtotal: $1018.00</p>
<p>Shipping:</p><p>$19.95</p>
<p>Total:</p><p>$1037.95</p>
</body></html>`,
};

/**
 * Eventbrite JSON-LD with a SPACE instead of the `T` in `startDate`.
 *
 * Real Eventbrite output: `"startDate": "2024-06-23 14:00:00"`. V8 parses that,
 * so it survives locally and looks fine — but it is not valid ISO 8601 and
 * strict parsers return NaN. Also a free order, hence no price.
 */
export const eventbriteSpacedStartDate: RawEmailInput = {
  from: '"Eventbrite" <noreply@order.eventbrite.com>',
  subject: 'Order Confirmation for Stern Grove Festival Featuring: Tegan and Sara with King Isis',
  receivedAt: '2024-05-23T21:03:30Z',
  html: `<html><head>
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EventReservation",
  "reservationNumber": "9000000000",
  "underName": { "@type": "Person", "name": "Pat Rivera" },
  "reservationFor": {
    "@type": "Event",
    "name": "Stern Grove Festival Featuring: Tegan and Sara with King Isis",
    "startDate": "2024-06-23 14:00:00",
    "endDate": "2024-06-23 16:30:00",
    "location": {
      "@type": "Place",
      "name": "Rhoda Goldman Concert Meadow @ Sigmund Stern Grove Recreation Area",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "addressCountry": "US"
      }
    }
  }
}
</script></head><body><p>Free order</p><p>$0.00</p></body></html>`,
};

/**
 * See Tickets with NO artist in the subject — just "Here Are Your Tickets".
 *
 * The subject-stripping path finds no "for", removes nothing, and hands back
 * the boilerplate as the artist name. The bill has to come from the body, where
 * it sits directly above the date with the headliner first:
 *
 *   Goldenvoice Presents / Mipso / Julia Pratt / Saturday, February 17, 2024
 *
 * Also carries "Doors 8:00PM | Show 9:00PM" — doors first on the same line.
 */
export const seeTicketsNoArtistInSubject: RawEmailInput = {
  from: 'See Tickets US <info@seetickets.us>',
  subject: 'Here Are Your Tickets',
  receivedAt: '2024-02-18T01:10:39Z',
  text: `February 17,2024

Pat Rivera,

Here are your tickets.

To access your recent orders, log into your See Tickets account.

Goldenvoice Presents

*Mipso*

Julia Pratt

Saturday, February 17, 2024

Great American Music Hall

859 O&apos;Farrell St., San Francisco, CA

Doors 8:00PM | Show 9:00PM

DOOR: GENERAL ADMISSION | $25.00

Your Receipt

Order Number
AA0BB1CCDDEE2F

Purchase Date
02/17/2024 5:10:37 PM`,
};

/**
 * DICE. Subjects the confirmation with the EVENT TITLE and nothing else, so no
 * subject pattern can ever match — the sender domain has to carry it.
 *
 * The date has NO YEAR anywhere in the message ("Sat 01 Oct,10:00 PM GMT-7"),
 * so it is resolved against the received date. The price is labelled "Price",
 * which is not a total-shaped label.
 */
export const diceEventTitleSubject: RawEmailInput = {
  from: 'DICE | Ticket Confirmation <tickets@dice.fm>',
  subject: 'SLOTHACID TOUR: SACHA ROBOTTI + TRUTH X LIES',
  receivedAt: '2022-10-02T02:15:03Z',
  html: `<html><body>
<p>Purchase confirmation</p>
<p>Nice one, Pat</p>
<p>You're going to SLOTHACID TOUR: SACHA ROBOTTI + TRUTH X LIES</p>
<p>Ticket details</p>
<table>
  <tr><td>Venue</td></tr>
  <tr><td>Halcyon SF</td></tr>
  <tr><td>314 11th St, San Francisco, CA 94103, USA</td></tr>
  <tr><td>Date &amp; time</td></tr>
  <tr><td>Sat 01 Oct,10:00 PM GMT-7</td></tr>
  <tr><td>Ticket type</td></tr>
  <tr><td>GA3</td></tr>
  <tr><td>Price</td></tr>
  <tr><td>$70.26</td></tr>
</table>
</body></html>`,
};
