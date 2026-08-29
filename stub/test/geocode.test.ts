import { describe, it, expect } from 'vitest';
import { pickPlace, type NominatimHit } from '@/lib/providers/geocode';

const sf: NominatimHit = {
  lat: '37.7792588',
  lon: '-122.4193286',
  name: 'San Francisco',
  display_name: 'San Francisco, California, United States',
  addresstype: 'city',
  class: 'boundary',
  address: {
    city: 'San Francisco',
    state: 'California',
    'ISO3166-2-lvl4': 'US-CA',
    country: 'United States',
    country_code: 'us',
  },
};

describe('pickPlace', () => {
  it('labels a US city with its state code, not the spelled-out state', () => {
    // "San Francisco, California, United States" is too long for a chip in the
    // search bar; the ISO subdivision gives the short form for free.
    expect(pickPlace([sf])?.label).toBe('San Francisco, CA');
  });

  it('parses coordinates as numbers', () => {
    const place = pickPlace([sf]);
    expect(place?.lat).toBeCloseTo(37.7792588);
    expect(place?.lng).toBeCloseTo(-122.4193286);
  });

  it('keeps the country on non-US places, where a bare region is ambiguous', () => {
    const melbourne: NominatimHit = {
      lat: '-37.8142',
      lon: '144.9632',
      name: 'Melbourne',
      addresstype: 'city',
      address: {
        city: 'Melbourne',
        state: 'Victoria',
        'ISO3166-2-lvl4': 'AU-VIC',
        country: 'Australia',
        country_code: 'au',
      },
    };
    expect(pickPlace([melbourne])?.label).toBe('Melbourne, VIC, Australia');
  });

  it('names the matched place, not the city that encloses it', () => {
    // Nominatim returns Brooklyn as addresstype `suburb` with
    // `address.city = "New York"`. Reading the address first labels Brooklyn's
    // own coordinates "New York, NY", which is wrong on the screen even though
    // the radius search would still be centred correctly.
    const brooklyn: NominatimHit = {
      lat: '40.6526006',
      lon: '-73.9497211',
      name: 'Brooklyn',
      addresstype: 'suburb',
      address: {
        city: 'New York',
        state: 'New York',
        'ISO3166-2-lvl4': 'US-NY',
        country: 'United States',
        country_code: 'us',
      },
    };
    expect(pickPlace([brooklyn])?.label).toBe('Brooklyn, NY');
  });

  it('skips street addresses in favour of a settlement', () => {
    // Searching "Fillmore" returns the venue's building first. Centring a
    // radius search on a building instead of a neighbourhood is wrong, so the
    // place-type filter has to reach past it.
    const venue: NominatimHit = {
      lat: '37.7841',
      lon: '-122.4330',
      display_name: '1805 Geary Blvd, San Francisco',
      addresstype: 'amenity',
      class: 'amenity',
    };
    const town: NominatimHit = {
      lat: '36.7052',
      lon: '-121.9019',
      name: 'Fillmore',
      addresstype: 'town',
      address: { town: 'Fillmore', state: 'California', 'ISO3166-2-lvl4': 'US-CA', country_code: 'us' },
    };
    expect(pickPlace([venue, town])?.label).toBe('Fillmore, CA');
  });

  it('falls back to a place-class hit when no address type matches', () => {
    const loose: NominatimHit = {
      lat: '51.5074',
      lon: '-0.1278',
      display_name: 'London, Greater London, England, United Kingdom',
      class: 'place',
    };
    expect(pickPlace([loose])?.label).toBe('London');
  });

  it('returns null when nothing is place-shaped', () => {
    expect(pickPlace([])).toBeNull();
    expect(
      pickPlace([{ lat: '1', lon: '1', addresstype: 'shop', class: 'shop' }]),
    ).toBeNull();
  });

  it('rejects a hit with unparseable coordinates rather than returning NaN', () => {
    expect(pickPlace([{ ...sf, lat: 'not-a-number' }])).toBeNull();
  });
});

/**
 * The network half, against the real Nominatim service.
 *
 * `pickPlace` above is tested against response shapes captured from live calls,
 * but nothing else confirms those shapes are still what the service returns.
 * Gated behind LIVE_TEST like `live-queries.test.ts`, both to keep `npm test`
 * offline and because Nominatim's usage policy allows one request per second.
 */
const live = process.env.LIVE_TEST === '1' ? describe : describe.skip;

live('geocode (live)', () => {
  it('resolves a city to plausible coordinates', async () => {
    const { geocode } = await import('@/lib/providers/geocode');
    const sf = await geocode('San Francisco');
    expect(sf?.label).toBe('San Francisco, CA');
    expect(sf!.lat).toBeGreaterThan(37.6);
    expect(sf!.lat).toBeLessThan(37.9);
    expect(sf!.lng).toBeLessThan(-122.3);
  }, 20_000);

  it('names a neighbourhood as itself, not as its parent city', async () => {
    const { geocode } = await import('@/lib/providers/geocode');
    expect((await geocode('Brooklyn'))?.label).toBe('Brooklyn, NY');
  }, 20_000);

  it('returns null for gibberish rather than throwing', async () => {
    const { geocode } = await import('@/lib/providers/geocode');
    expect(await geocode('zzqxwv not a place at all')).toBeNull();
  }, 20_000);
});
