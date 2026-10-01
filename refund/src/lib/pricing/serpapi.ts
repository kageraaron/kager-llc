import 'server-only';

/**
 * SerpApi's Google Flights and Google Hotels engines: the same prices a person
 * sees on Google, for the exact flights or property on the booking.
 *
 * Every call is a paid search (250 free a month), so the checker spends as few
 * as it can: one search per leg, and the fare-type lookup only when the price
 * already looks lower than what was paid.
 */

const BASE = 'https://serpapi.com/search.json';

async function serp<T>(params: Record<string, string | number | undefined>): Promise<T> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY is not set');
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
const segKey = (s: Segment) => norm(`${s.carrier ?? ''}${s.flight ?? ''}`);

/** Split a round trip at the longest gap between departures. */
export function splitLegs(segments: Segment[]): { out: Segment[]; back: Segment[] } {
  const segs = [...segments].sort((a, b) => (a.departs ?? '').localeCompare(b.departs ?? ''));
  const roundTrip = segs.length > 1 && segs[0].from && segs[0].from === segs[segs.length - 1].to;
  if (!roundTrip) return { out: segs, back: [] };
  let cut = 1;
  let gap = -1;
  for (let i = 1; i < segs.length; i++) {
    const g = new Date(segs[i].departs ?? 0).getTime() - new Date(segs[i - 1].departs ?? 0).getTime();
    if (g > gap) { gap = g; cut = i; }
  }
  return { out: segs.slice(0, cut), back: segs.slice(cut) };
}

function findOption(options: SerpFlightOption[], leg: Segment[]): SerpFlightOption | undefined {
  const want = leg.map(segKey).join('|');
  return options.find((o) => o.flights.map((f) => norm(f.flight_number)).join('|') === want);
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
  segments: Segment[],
  opts: { passengers: number; fareBrand?: string; paidCents: number },
): Promise<FlightQuote> {
  const { out, back } = splitLegs(segments);
  if (!out.length || !out[0].from || !out[out.length - 1].to || !out[0].departs) {
    return { matched: false, note: 'Missing airports or dates' };
  }
  const base = {
    engine: 'google_flights',
    departure_id: out[0].from,
    arrival_id: out[out.length - 1].to,
    outbound_date: out[0].departs.slice(0, 10),
    return_date: back[0]?.departs?.slice(0, 10),
    type: back.length ? 1 : 2,
    travel_class: travelClass(opts.fareBrand),
    adults: opts.passengers,
  };

  const first = await serp<SerpFlightsResponse>(base);
  let option = findOption([...(first.best_flights ?? []), ...(first.other_flights ?? [])], out);
  if (!option) return { matched: false, note: 'Outbound flights not found in today’s results' };

  if (back.length) {
    if (!option.departure_token) return { matched: false, note: 'No return options for this outbound' };
    const returns = await serp<SerpFlightsResponse>({ ...base, departure_token: option.departure_token });
    option = findOption([...(returns.best_flights ?? []), ...(returns.other_flights ?? [])], back);
    if (!option) return { matched: false, note: 'Return flights not found in today’s results' };
  }

  const cheapest = option.price != null ? Math.round(option.price * 100) : undefined;
  if (cheapest == null) return { matched: false, note: 'No price shown' };
  if (cheapest >= opts.paidCents) return { matched: true, totalCents: cheapest, note: 'Cheapest fare in cabin' };

  // Looks lower. Is it the same fare type, or just Basic Economy?
  if (!option.booking_token) return { matched: false, totalCents: cheapest, note: 'Couldn’t check the fare type' };
  const booking = await serp<SerpBookingResponse>({ ...base, booking_token: option.booking_token });
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
export async function quoteHotel(stay: {
  property: string;
  city?: string;
  check_in: string;
  check_out: string;
  adults?: number;
}): Promise<{ matched: boolean; totalCents?: number; note?: string }> {
  const data = await serp<SerpHotelsResponse>({
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
