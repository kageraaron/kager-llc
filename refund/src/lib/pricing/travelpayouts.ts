import 'server-only';

/**
 * Travelpayouts (Aviasales) Data API: the cheapest fare recently SEEN on a
 * route and date. Free and unmetered, but cached: anywhere from hours to a
 * week old, and only as complete as what Aviasales users searched for.
 *
 * So it can't confirm a drop. What it can do is rule one out cheaply: if the
 * cheapest fare anyone has seen on the route is still above what was paid,
 * the specific flights can't be cheaper either, and the SerpApi search (which
 * is metered) can wait.
 */

interface Row { price?: number }

export async function cheapestCachedFare(route: {
  from: string;
  to: string;
  departs: string;      // YYYY-MM-DD
  returns?: string;     // YYYY-MM-DD for a round trip
}): Promise<number | null> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return null;

  const qs = new URLSearchParams({
    origin: route.from,
    destination: route.to,
    departure_at: route.departs,
    one_way: route.returns ? 'false' : 'true',
    currency: 'usd',
    sorting: 'price',
    direct: 'false',
    unique: 'false',
    limit: '10',
    page: '1',
  });
  if (route.returns) qs.set('return_at', route.returns);

  try {
    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${qs}`, {
      headers: { 'X-Access-Token': token, 'Accept-Encoding': 'gzip, deflate' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { success?: boolean; data?: Row[] };
    const prices = (body.data ?? []).map((r) => r.price).filter((p): p is number => typeof p === 'number' && p > 0);
    return prices.length ? Math.round(Math.min(...prices) * 100) : null;
  } catch {
    // A cache that's down just means "no shortcut today".
    return null;
  }
}
