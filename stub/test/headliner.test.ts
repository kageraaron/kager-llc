import { describe, it, expect } from 'vitest';
import { pickHeadlinerName, normName } from '@/lib/ingest/catalog';

/**
 * Ticketmaster's attraction list is ordered arbitrarily and often omits the
 * headliner entirely. Two real events from production, where taking
 * `attractions[0]` put the SUPPORT act on the card:
 *
 *   "Parcels with Velvet Trip - Ages 21+"      attractions: [Velvet Trip]
 *   "SOFI TUKKER Presents: ANIMAL TALK (18+)"  attractions: [DRAMA, Kito]
 *
 * The ticket the user bought knows better than the listing does.
 */
describe('pickHeadlinerName', () => {
  it('takes the act off the ticket when the attractions omit it', () => {
    expect(pickHeadlinerName('Parcels with Velvet Trip - Ages 21+', ['Velvet Trip'], 'Parcels'))
      .toBe('Parcels');
    expect(pickHeadlinerName('SOFI TUKKER Presents: ANIMAL TALK (18+)', ['DRAMA', 'Kito'], 'Sofi Tukker'))
      .toBe('Sofi Tukker');
  });

  it('prefers a matching attraction over the raw searched string', () => {
    // The attraction carries an id and artwork; the bare name carries neither.
    expect(pickHeadlinerName('Weezer at the Chase Center', ['Weezer', 'Support Act'], 'weezer'))
      .toBe('Weezer');
  });

  it('requires the event name to corroborate before trusting the ticket', () => {
    /*
     * The guard that keeps a festival ticket from becoming the headliner of one
     * of its own sets: "Outside Lands" appears nowhere in this event's name, so
     * the attraction stands.
     */
    expect(pickHeadlinerName('Tame Impala', ['Tame Impala'], 'Outside Lands'))
      .toBe('Tame Impala');
  });

  it('falls back to the first attraction when there is nothing better', () => {
    expect(pickHeadlinerName('Some Show', ['First Act', 'Second Act'])).toBe('First Act');
    expect(pickHeadlinerName('Some Show', ['First Act'], 'Unrelated')).toBe('First Act');
  });

  it('returns null rather than inventing a headliner', () => {
    expect(pickHeadlinerName('Some Show', [])).toBeNull();
  });

  it('ignores case and punctuation when comparing', () => {
    expect(pickHeadlinerName('Tegan & Sara Live', ['Tegan and Sara'], 'Tegan & Sara'))
      .toBe('Tegan and Sara');
  });

  it('will not match on a fragment too short to be meaningful', () => {
    // A two-character "artist" appearing inside a longer word is a coincidence.
    expect(pickHeadlinerName('Underworld', ['Real Act'], 'un')).toBe('Real Act');
  });
});

describe('a provider spelling beats our parsed one', () => {
  it('keeps "Fred again.." over "Fred Again" when the attraction is listed', () => {
    /*
     * Ticketmaster styles the act "Fred again.."; the ticket email gives
     * "Fred Again". Same artist, and the provider's spelling is the canonical
     * one — so the attraction must win rather than being replaced.
     */
    expect(pickHeadlinerName('Fred again..', ['Fred again..'], 'Fred Again')).toBe('Fred again..');
  });

  it('normalises away the punctuation that makes them look different', () => {
    expect(normName('Fred again..')).toBe(normName('Fred Again'));
  });
});
