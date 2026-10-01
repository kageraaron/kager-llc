import 'server-only';
import type { Db } from '@/lib/db';

/**
 * AeroDataBox (through RapidAPI): was a flight cancelled or badly delayed?
 *
 * One call per flight per check. The free plan is 600 units a month and a
 * flight-status call costs more than one unit, so calls are counted against a
 * monthly cap the same way SerpApi's are (refund.claim_api_call).
 */

const HOST = 'aerodatabox.p.rapidapi.com';
export const AERODATABOX_CAP = Number(process.env.AERODATABOX_MONTHLY_CAP) || 250;

export interface FlightStatus {
  /** As the provider words it: "Arrived", "Canceled", "Delayed", "Expected"… */
  status: string;
  cancelled: boolean;
  /** Minutes late on arrival (falling back to departure), or null if unknown. */
  delayMin: number | null;
  international: boolean;
}

interface AdbTime { utc?: string }
interface AdbMovement {
  airport?: { iata?: string; countryCode?: string };
  scheduledTime?: AdbTime;
  revisedTime?: AdbTime;
  runwayTime?: AdbTime;
}
interface AdbFlight {
  status?: string;
  departure?: AdbMovement;
  arrival?: AdbMovement;
}

const mins = (a?: string, b?: string) =>
  a && b ? Math.round((new Date(b.replace(' ', 'T')).getTime() - new Date(a.replace(' ', 'T')).getTime()) / 60_000) : null;

/** Latest known time for a movement: actual, else revised estimate. */
const actual = (m?: AdbMovement) => m?.runwayTime?.utc ?? m?.revisedTime?.utc;

export function parseStatus(flights: AdbFlight[], from?: string): FlightStatus | null {
  // A flight number can fly several legs a day; take the one leaving our airport.
  const f = flights.find((x) => !from || x.departure?.airport?.iata === from) ?? flights[0];
  if (!f) return null;
  const status = f.status ?? 'Unknown';
  const arrivalDelay = mins(f.arrival?.scheduledTime?.utc, actual(f.arrival));
  const departureDelay = mins(f.departure?.scheduledTime?.utc, actual(f.departure));
  const a = f.departure?.airport?.countryCode;
  const b = f.arrival?.airport?.countryCode;
  return {
    status,
    cancelled: /cancel/i.test(status),
    delayMin: arrivalDelay ?? departureDelay,
    international: !!a && !!b && a !== b,
  };
}

/** `number` like "AA2529", `date` the local departure date YYYY-MM-DD. */
export async function flightStatus(db: Db, number: string, date: string, from?: string): Promise<FlightStatus | null> {
  const key = process.env.AERODATABOX_API_KEY;
  if (!key) return null;

  const { data: ok, error } = await db.rpc('claim_api_call', { p_provider: 'aerodatabox', p_cap: AERODATABOX_CAP });
  if (error) throw error;
  if (!ok) return null;

  const res = await fetch(`https://${HOST}/flights/number/${encodeURIComponent(number)}/${date}`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
  });
  // 204/404: the provider has no record of that flight on that day.
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`AeroDataBox ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as AdbFlight[] | AdbFlight;
  return parseStatus(Array.isArray(body) ? body : [body], from);
}
