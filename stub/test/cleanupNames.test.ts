import { describe, it, expect } from 'vitest';
import { proposeCleanName, looksLikeJunkName } from '@/lib/ingest/cleanupNames';

/**
 * Every case below is a real stored artist row from production.
 *
 * The pass only ever SUBTRACTS recognised noise. That is what makes it safe
 * without a provider to check against — and these rows have no provider, which
 * is exactly why they are junk: "Add it anyway" uses the email's parsed name
 * for both the event and the artist, so a poor parse lands twice.
 */
describe('proposeCleanName — real rows from production', () => {
  it('strips an order number tacked onto the end', () => {
    expect(proposeCleanName('Day Trip Digital Tickets : Order #175815029')).toBe('Day Trip');
  });

  it('strips a "Your tickets:" prefix', () => {
    expect(proposeCleanName('Your tickets: Black Book Records - Miami Music Week'))
      .toBe('Black Book Records - Miami Music Week');
  });

  it('strips a series code and a venue-and-date tail', () => {
    expect(proposeCleanName('MMW26: ODD MOB @ MIDLINE 03.28')).toBe('ODD MOB');
  });

  it('strips a qualified presale tag', () => {
    expect(proposeCleanName('Max Styler - Artist Presale')).toBe('Max Styler');
    expect(proposeCleanName('Eric Prydz - Artist Presale')).toBe('Eric Prydz');
  });
});

describe('proposeCleanName — a promoter party billed with its acts', () => {
  it('takes the act, not the party brand', () => {
    // MACCABI SF is the night; ADAM TEN and MITA GAMI are who played. The act
    // is also the only half that resolves against any provider.
    expect(proposeCleanName('MACCABI SF w/ ADAM TEN + MITA GAMI')).toBe('ADAM TEN');
    expect(proposeCleanName('Dirtybird SF with Claude VonStroke')).toBe('Claude VonStroke');
  });

  it('only splits on "+" once "w/" has already matched', () => {
    /*
     * A bare "+" is not enough on its own: "Simon + Garfunkel" is one act's
     * actual name, and splitting it would be a rename rather than a cleanup.
     */
    expect(proposeCleanName('Simon + Garfunkel')).toBeNull();
    expect(proposeCleanName('Sleaford Mods + Special Guest')).toBeNull();
  });
});

describe('proposeCleanName — declines rather than guesses', () => {
  it('leaves an ordinary name completely alone', () => {
    for (const name of [
      'Fred Again',
      'Silva Bumpa',
      'Tegan & Sara',
      'Nine Inch Nails - Trent Reznor',
      'Godspeed You! Black Emperor',
      'Chris Stussy',
      '!!!',
    ]) {
      expect(looksLikeJunkName(name), name).toBe(false);
      expect(proposeCleanName(name), name).toBeNull();
    }
  });

  it('does not touch a real act whose name contains a colon', () => {
    // "LSR/CITY: CYBERPUNK" is a production, not a series code — the prefix
    // rule requires a short ALL-CAPS token with no punctuation in it.
    expect(proposeCleanName('LSR/CITY: CYBERPUNK')).toBeNull();
  });

  it('returns null when stripping would leave nothing meaningful', () => {
    expect(proposeCleanName('Order #12345678')).toBeNull();
    expect(proposeCleanName('Your tickets:')).toBeNull();
    expect(proposeCleanName('Tickets')).toBeNull();
  });

  it('returns null when the rules would change nothing', () => {
    // Detected as junk-shaped but nothing actually removable.
    expect(proposeCleanName('Presale')).toBeNull();
  });
});
