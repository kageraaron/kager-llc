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
