import { describe, it, expect } from 'vitest';
import { shouldNotify, scanMessage } from '@/lib/notifyScan';

/**
 * The scan runs every 30 minutes and finds nothing almost every time, so the
 * bar for pushing has to be high. A notification that arrives twice an hour to
 * say "nothing happened" is how a user turns notifications off for good.
 */
describe('shouldNotify', () => {
  it('stays silent on a scan that found nothing to act on', () => {
    expect(shouldNotify({ added: 0, review: 0 })).toBe(false);
    // 300 marketing emails read and discarded is not news.
    expect(shouldNotify({ added: 0, review: 0, skipped: 300 })).toBe(false);
    // Nor is a provider hiccup — that is for the logs, not the user's phone.
    expect(shouldNotify({ added: 0, review: 0, errors: 4 })).toBe(false);
  });

  it('fires when a show was added or something needs review', () => {
    expect(shouldNotify({ added: 1, review: 0 })).toBe(true);
    expect(shouldNotify({ added: 0, review: 1 })).toBe(true);
  });
});

describe('scanMessage', () => {
  it('leads with the review count, because that is the one needing a tap', () => {
    // An added show is already on the calendar; a review item is a question.
    const both = scanMessage({ added: 2, review: 3 });
    expect(both.title).toBe('2 shows added');
    expect(both.body).toContain('3 tickets to review');
    expect(both.url).toBe('/inbox');
  });

  it('sends review-only traffic to the Inbox and additions to Upcoming', () => {
    expect(scanMessage({ added: 0, review: 1 }).url).toBe('/inbox');
    expect(scanMessage({ added: 1, review: 0 }).url).toBe('/upcoming');
  });

  it('pluralises', () => {
    expect(scanMessage({ added: 1, review: 0 }).title).toBe('1 show added');
    expect(scanMessage({ added: 4, review: 0 }).title).toBe('4 shows added');
    expect(scanMessage({ added: 0, review: 1 }).title).toBe('1 ticket to review');
  });
});
