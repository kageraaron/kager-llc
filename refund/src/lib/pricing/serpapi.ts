import 'server-only';
import type { Db } from '@/lib/db';
import { claimSerpCall } from '@/lib/budget';

/**
 * SerpApi's Google Flights and Google Hotels engines: the same prices a person
 * sees on Google, for the exact flights or property on the booking.
 *
 * Every call is a paid search (250 free a month), so the checker spends as few
 * as it can: one search per leg, and the fare-type lookup only when the price
 * already looks lower than what was paid.
 */

const BASE = 'https://serpapi.com/search.json';

async function serp<T>(db: Db, params: Record<string, string | number | undefined>): Promise<T> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY is not set');
  // Every search spends the monthly budget; this throws BudgetExhausted when it's gone.
  await claimSerpCall(db);
  const qs = new URLSearchParams({ api_key: key, hl: 'en', gl: 'us', currency: 'USD' });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const res = await fetch(`${BASE}?${qs}`);
  if (!res.ok) throw new Error(`SerpApi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as T & { error?: string };
  if (data.error) throw new Error(`SerpApi: ${data.error}`);
  return data;
}

// ------------------------------------------------------------------ flights

export interface Segment {
  carrier?: string;
  flight?: string;
  from?: string;
  to?: string;
  departs?: string;
}

export interface SerpFlightOption {
  flights: { flight_number?: string; departure_airport?: { id?: string; time?: string } }[];
  price?: number;
  departure_token?: string;
  booking_token?: string;
}
interface SerpFlightsResponse {
  best_flights?: SerpFlightOption[];
  other_flights?: SerpFlightOption[];
}
interface SerpBookingResponse {
  booking_options?: { together?: { price?: number; option_title?: string; book_with?: string; extensions?: string[] } }[];
}

const norm = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase();
/**
 * "AA" + "2529", "AA" + "AA 2529" and SerpApi's "AA 2529" all mean the same
 * flight: carrier plus the digits. Real airline markup puts the carrier in
 * `flightNumber` about half the time.
 */
const segKey = (s: Segment) => {
  const carrier = norm(s.carrier);
  const flight = norm(s.flight);
  return flight.startsWith(carrier) ? flight : `${carrier}${flight}`;
};
const optionKey = (f: { flight_number?: string }) => norm(f.flight_number);

const HOUR = 3_600_000;

/**
 * Split a booking into legs: a new leg starts wherever the gap between one
 * departure and the next is over 12 hours (a connection is shorter). One leg is
 * a one-way, two legs ending where they began a round trip, anything else a
 * multi-city trip (e.g. MCO→PHL, then PHL→SFO four days later).
 */
export function splitLegs(segments: Segment[]): { out: Segment[]; back: Segment[]; legs: Segment[][] } {
  const segs = [...segments].sort((a, b) => (a.departs ?? '').localeCompare(b.departs ?? ''));
  const legs: Segment[][] = [];
  for (const s of segs) {
    const prev = legs.at(-1)?.at(-1);
    const gap = prev ? new Date(s.departs ?? 0).getTime() - new Date(prev.departs ?? 0).getTime() : Infinity;
    if (!prev || gap > 12 * HOUR) legs.push([s]);
    else legs.at(-1)!.push(s);
  }
  return { out: legs[0] ?? [], back: legs.length === 2 ? legs[1] : [], legs };
}

/** Minutes since midnight, from "2026-11-21T22:35:00" or "2026-11-21 22:35". */
const minutesOf = (stamp?: string) => {
  const m = /[T ](\d{2}):(\d{2})/.exec(stamp ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The option that is the flights on the ticket.
 *
 * By flight number first. But airlines renumber flights months out: a real
 * booking for the 10:35 pm San Francisco to Orlando flight was UA1947, then
 * UA1331 after a schedule change, and UA2799 in that day's search. The plane
 * and the seat are the same. So when the numbers find nothing, the same
 * airline leaving the same airport on that day within 20 minutes of the
 * ticketed time is taken to be the same flight.
 */
export function findOption(options: SerpFlightOption[], leg: Segment[]): SerpFlightOption | undefined {
  const want = leg.map(segKey).join('|');
  const exact = options.find((o) => o.flights.map(optionKey).join('|') === want);
  if (exact) return exact;

  return options.find(
    (o) =>
      o.flights.length === leg.length &&
      o.flights.every((f, i) => {
        const seg = leg[i];
        const booked = minutesOf(seg.departs);
        const listed = minutesOf(f.departure_airport?.time);
        return (
          !!seg.carrier &&
          optionKey(f).startsWith(norm(seg.carrier)) &&
          (!seg.from || f.departure_airport?.id === seg.from) &&
          booked !== null &&
          listed !== null &&
          Math.abs(booked - listed) <= 20
        );
      }),
  );
}

const travelClass = (brand?: string) =>
  /first|delta one|polaris|flagship/i.test(brand ?? '') ? 4
    : /business/i.test(brand ?? '') ? 3
      : /premium|comfort|economy plus|choice extra/i.test(brand ?? '') ? 2
        : 1;

export interface FlightQuote {
  matched: boolean;
  totalCents?: number;
  note?: string;
}

/**
 * Today's all-in price for the same flights and fare type.
 *
 * `paidCents` decides whether the fare-type lookup is worth a search: if the
 * itinerary isn't cheaper than what was paid, the cabin's cheapest fare is
 * already enough to say "no drop".
 */
export async function quoteFlights(
  db: Db,
  segments: Segment[],
  opts: { passengers: number; fareBrand?: string; paidCents: number; refundable?: boolean },
): Promise<FlightQuote> {
  const { legs } = splitLegs(segments);
  const ends = (leg: Segment[]) => ({ from: leg[0]?.from, to: leg[leg.length - 1]?.to, date: leg[0]?.departs?.slice(0, 10) });
  if (!legs.length || legs.some((l) => { const e = ends(l); return !e.from || !e.to || !e.date; })) {
    return { matched: false, note: 'Missing airports or dates' };
  }
  const first = ends(legs[0]);
  const last = ends(legs[legs.length - 1]);
  const roundTrip = legs.length === 2 && first.from === last.to && first.to === last.from;
  const base: Record<string, string | number | undefined> = {
    engine: 'google_flights',
    travel_class: travelClass(opts.fareBrand),
    adults: opts.passengers,
    ...(legs.length === 1
      ? { type: 2, departure_id: first.from, arrival_id: first.to, outbound_date: first.date }
      : roundTrip
        ? { type: 1, departure_id: first.from, arrival_id: first.to, outbound_date: first.date, return_date: last.date }
        : {
            type: 3,
            multi_city_json: JSON.stringify(legs.map((l) => {
              const e = ends(l);
              return { departure_id: e.from, arrival_id: e.to, date: e.date };
            })),
          }),
  };

  // Walk the legs: each response lists options for the next leg; pick the
  // exact flights, then follow its departure_token to the leg after.
  let option: SerpFlightOption | undefined;
  for (let i = 0; i < legs.length; i++) {
    const page: SerpFlightsResponse = await serp<SerpFlightsResponse>(
      db,
      i === 0 ? base : { ...base, departure_token: option!.departure_token },
    );
    option = findOption([...(page.best_flights ?? []), ...(page.other_flights ?? [])], legs[i]);
    if (!option) return { matched: false, note: `Leg ${i + 1} flights not found in today’s results` };
    if (i < legs.length - 1 && !option.departure_token) return { matched: false, note: `No onward options after leg ${i + 1}` };
  }
  if (!option) return { matched: false, note: 'No flights' };

  const cheapest = option.price != null ? Math.round(option.price * 100) : undefined;
  if (cheapest == null) return { matched: false, note: 'No price shown' };
  if (cheapest >= opts.paidCents) return { matched: true, totalCents: cheapest, note: 'Cheapest fare in cabin' };

  // Looks lower. Is it the same fare type, or just Basic Economy?
  if (!option.booking_token) return { matched: false, totalCents: cheapest, note: 'Couldn’t check the fare type' };
  const booking = await serp<SerpBookingResponse>(db, { ...base, booking_token: option.booking_token });
  const owned = (opts.fareBrand ?? '').toLowerCase();
  const ownedIsBasic = /basic/.test(owned);
  const fares = (booking.booking_options ?? [])
    .map((b) => b.together)
    .filter((t): t is NonNullable<typeof t> => !!t && typeof t.price === 'number');
  const titled = fares.filter((t) => t.option_title);
  if (titled.length === 0) return { matched: false, totalCents: cheapest, note: 'Fare types not listed' };
  const same = pickFare(titled, { basic: ownedIsBasic, refundable: opts.refundable });
  if (!same) {
    const what = opts.refundable ? 'refundable' : (opts.fareBrand ?? 'matching');
    return { matched: false, totalCents: cheapest, note: `No ${what} fare offered` };
  }
  return { matched: true, totalCents: Math.round(same.price! * 100), note: same.option_title };
}

type Fare = { price?: number; option_title?: string; extensions?: string[] };

/**
 * Today's price for the SAME KIND of fare as the ticket.
 *
 * One flight is sold several ways at once: Basic Economy, Economy with no
 * refunds, "Economy Fully Refundable", and the cabins above. A real
 * itinerary listed Economy at $1,039 and Economy Fully Refundable at $1,209
 * on the same day; the ticket was refundable and had cost $1,119. Compared
 * with the cheapest, that read as an $80 drop. It was a $90 rise.
 *
 *  - a refundable ticket is priced against refundable fares only;
 *  - any other ticket never against a refundable one (it is dearer, so this
 *    only matters for which label is reported);
 *  - Basic Economy against Basic, everything else against non-Basic.
 */
export function pickFare<T extends Fare>(fares: T[], owned: { basic: boolean; refundable?: boolean }): T | undefined {
  const isRefundable = (f: Fare) => /refundable/i.test(f.option_title ?? '') || (f.extensions ?? []).some((e) => /^full refunds?$/i.test(e));
  const isBasic = (f: Fare) => /basic/i.test(f.option_title ?? '');
  return fares
    .filter((f) => typeof f.price === 'number')
    .filter((f) => isBasic(f) === owned.basic)
    .filter((f) => (owned.refundable ? isRefundable(f) : !isRefundable(f)))
    .sort((a, b) => a.price! - b.price!)[0];
}

// ------------------------------------------------------------------ hotels

interface SerpRate { extracted_lowest?: number }
interface SerpRoom { name?: string; total_rate?: SerpRate }
interface SerpSource { source?: string; official?: boolean; total_rate?: SerpRate; rooms?: SerpRoom[] }
interface SerpHotelsResponse {
  name?: string;
  total_rate?: SerpRate;
  featured_prices?: SerpSource[];
  properties?: { name?: string; total_rate?: SerpRate }[];
}

const hotelKey = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * What kind of room a name describes, however the hotel abbreviates it:
 * "1 King 1 Qn 2 Bdrm Suite Balcony" is two bedrooms with a king and a queen.
 */
export function roomKind(name: string): { bedrooms: number | null; beds: string[] } {
  const s = name.toLowerCase();
  const bdrm = /(\d|one|two|three)[\s-]*(?:bdrm|bedroom|bed room|br)\b/.exec(s);
  const count = bdrm ? ({ one: 1, two: 2, three: 3 } as Record<string, number>)[bdrm[1]] ?? Number(bdrm[1]) : null;
  const bedrooms = count ?? (/\bstudio\b/.test(s) ? 0 : null);
  const beds = [
    /\b(?:king|kg|k)\b/.test(s) && 'king',
    /\b(?:queen|qn|q)\b/.test(s) && 'queen',
    /\b(?:twin|single)\b/.test(s) && 'twin',
    /\b(?:double|dbl)\b/.test(s) && 'double',
  ].filter(Boolean) as string[];
  return { bedrooms, beds };
}

/**
 * Is a listed room the one that was booked? The number of bedrooms has to
 * agree whenever both names give one: a studio is not a two-bedroom suite,
 * whatever else matches. Otherwise the bed types have to overlap.
 */
export function sameRoom(owned: string, listed: string): boolean {
  const a = roomKind(owned);
  const b = roomKind(listed);
  if (a.bedrooms !== null && b.bedrooms !== null) return a.bedrooms === b.bedrooms;
  if (a.bedrooms !== null || b.bedrooms !== null) return false;
  return a.beds.length > 0 && a.beds.every((bed) => b.beds.includes(bed));
}

/** A rate with something bundled in is not the room's price. */
const BUNDLED = /\b(?:parking|breakfast|package|pkg|bonus points|points for|dining|credit)\b/i;

/**
 * Today's total for the same property, dates and ROOM.
 *
 * Comparing a booking with a hotel's "lowest rate" compared a two-bedroom
 * suite with the cheapest studio sold by a discount site, and reported a $748
 * saving that did not exist. So: the hotel's own listing where there is one,
 * the booked room type, a plain rate, taxes included on both sides. And when
 * the room is not on sale for those dates, the honest answer is that there is
 * nothing to compare, not the price of another room.
 */
export async function quoteHotel(db: Db, stay: {
  property: string;
  city?: string;
  check_in: string;
  check_out: string;
  adults?: number;
  room?: string;
}): Promise<{ matched: boolean; totalCents?: number; note?: string }> {
  const data = await serp<SerpHotelsResponse>(db, {
    engine: 'google_hotels',
    q: [stay.property, stay.city].filter(Boolean).join(' '),
    check_in_date: stay.check_in.slice(0, 10),
    check_out_date: stay.check_out.slice(0, 10),
    adults: stay.adults ?? 2,
  });
  const want = hotelKey(stay.property);
  // A specific enough query returns the property itself; otherwise a list.
  const direct = data.name && hotelKey(data.name).includes(want.slice(0, 12)) ? data : undefined;
  const hit =
    direct ??
    data.properties?.find((p) => hotelKey(p.name).includes(want.slice(0, 12)) || want.includes(hotelKey(p.name)));
  if (!hit) return { matched: false, note: 'Property not found for these dates' };

  const sources = direct?.featured_prices ?? [];
  const official = sources.filter((s) => s.official);
  const rooms = (official.length ? official : sources).flatMap((s) => s.rooms ?? []);

  if (stay.room) {
    const cents = (r: SerpRoom) => (r.total_rate?.extracted_lowest != null ? Math.round(r.total_rate.extracted_lowest * 100) : null);
    const mine = rooms.filter((r) => r.name && sameRoom(stay.room!, r.name) && cents(r) !== null);
    if (mine.length === 0) return { matched: false, note: `Your room (${stay.room}) isn’t listed for these dates` };
    const plain = mine.filter((r) => !BUNDLED.test(r.name!));
    const best = (plain.length ? plain : mine).sort((x, y) => cents(x)! - cents(y)!)[0];
    return { matched: true, totalCents: cents(best)!, note: best.name!.slice(0, 80) };
  }

  // No room on the booking: the hotel's own lowest, which is at least the same seller.
  const lowest = official[0]?.total_rate?.extracted_lowest ?? hit.total_rate?.extracted_lowest;
  if (lowest == null) return { matched: false, note: 'No rate shown for these dates' };
  return { matched: true, totalCents: Math.round(lowest * 100), note: 'Lowest rate, any room type' };
}

// ------------------------------------------------------------------ Amazon

interface SerpAmazonResponse {
  organic_results?: { asin?: string; extracted_price?: number; title?: string }[];
}

export { asinFrom } from '@/lib/asin';

/**
 * Amazon's current price for one item, in cents. One search, by ASIN: Amazon's
 * own search returns the exact product for its ASIN, and a result only counts
 * if its ASIN is the one asked for. Null when it is not listed with a price
 * (out of stock, or only sold by others).
 */
export async function amazonPrice(db: Db, asin: string): Promise<number | null> {
  const data = await serp<SerpAmazonResponse>(db, { engine: 'amazon', k: asin, amazon_domain: 'amazon.com' });
  const hit = (data.organic_results ?? []).find((r) => r.asin === asin);
  return hit?.extracted_price != null ? Math.round(hit.extracted_price * 100) : null;
}
