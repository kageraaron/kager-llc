import { describe, it, expect } from 'vitest';
import { namesMatch } from '@/lib/providers/artistImages';

/**
 * A memory app is mostly pictures of the acts you saw, so the cost of a wrong
 * match is a stranger's face on someone's memory. The cost of a miss is
 * initials, which is fine. The bar is set accordingly — but not so high that a
 * rename gets rejected.
 */
describe('namesMatch', () => {
  it('accepts an exact match regardless of case and punctuation', () => {
    expect(namesMatch('Silva Bumpa', 'Silva Bumpa')).toBe(true);
    expect(namesMatch('KETTAMA', 'Kettama')).toBe(true);
    expect(namesMatch('Tegan and Sara', 'Tegan & Sara')).toBe(true);
    expect(namesMatch('Sigur Rós', 'Sigur Ros')).toBe(true);
  });

  it('tolerates a leading "the"', () => {
    expect(namesMatch('The Fratellis', 'Fratellis')).toBe(true);
  });

  it('survives an artist renaming themselves', () => {
    /*
     * Chris Stussy now records as CHRIS STASSY. Deezer still lists the old
     * spelling, Spotify has the new one, and our own row holds whatever the
     * ticket email said — three different vintages of the same person. Strict
     * equality would reject whichever source happens to be current.
     */
    expect(namesMatch('Chris Stussy', 'CHRIS STASSY')).toBe(true);
  });

  it('does not let one character merge two short, distinct names', () => {
    // One character is a much larger share of a short name.
    expect(namesMatch('Kiss', 'Kish')).toBe(false);
    expect(namesMatch('MGMT', 'MGMP')).toBe(false);
    expect(namesMatch('Muse', 'Ruse')).toBe(false);
  });

  it('rejects a genuinely different act', () => {
    expect(namesMatch('Chris Lake', 'Chris Lorenzo')).toBe(false);
    expect(namesMatch('Overmono', 'Overmono Live Band Experience')).toBe(false);
    expect(namesMatch('Kaskade', 'Coachella')).toBe(false);
  });

  it('rejects empty or punctuation-only input rather than matching everything', () => {
    expect(namesMatch('', 'Overmono')).toBe(false);
    expect(namesMatch('Overmono', '')).toBe(false);
    expect(namesMatch('!!!', '???')).toBe(false);
  });
});
