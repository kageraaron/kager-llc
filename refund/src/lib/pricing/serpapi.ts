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

interface SerpFlightOption {
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
  booking_options?: { together?: { price?: number; option_title?: string; book_with?: string } }[];
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

function findOption(options: SerpFlightOption[], leg: Segment[]): SerpFlightOption | undefined {
  const want = leg.map(segKey).join('|');
  return options.find((o) => o.flights.map(optionKey).join('|') === want);
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
  opts: { passengers: number; fareBrand?: string; paidCents: number },
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
  const same = titled
    .filter((t) => (ownedIsBasic ? /basic/i.test(t.option_title!) : !/basic/i.test(t.option_title!)))
    .sort((a, b) => a.price! - b.price!)[0];
  if (!same) return { matched: false, totalCents: cheapest, note: `No ${opts.fareBrand ?? 'matching'} fare offered` };
  return { matched: true, totalCents: Math.round(same.price! * 100), note: same.option_title };
}

// ------------------------------------------------------------------ hotels

interface SerpHotelsResponse {
  name?: string;
  total_rate?: { extracted_lowest?: number };
  properties?: { name?: string; total_rate?: { extracted_lowest?: number } }[];
}

const hotelKey = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lowest total for the same property and dates. Room type isn't matched, so alerts say "about". */
export async function quoteHotel(db: Db, stay: {
  property: string;
  city?: string;
  check_in: string;
  check_out: string;
  adults?: number;
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
  const total = hit?.total_rate?.extracted_lowest;
  if (total == null) return { matched: false, note: 'Property not found for these dates' };
  return { matched: true, totalCents: Math.round(total * 100), note: 'Lowest rate, any room type' };
}
