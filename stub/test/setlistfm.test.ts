import { describe, it, expect } from 'vitest';
import { toSetlistDate } from '@/lib/providers/setlistfm';

describe('toSetlistDate', () => {
  it('uses the venue timezone, not the host timezone', () => {
    // 8pm Pacific on 18 Apr is already 19 Apr in UTC. setlist.fm files the show
    // under the local date, so the venue zone has to win.
    expect(toSetlistDate('2026-04-19T03:00:00Z', 'America/Los_Angeles')).toBe('18-04-2026');
    expect(toSetlistDate('2026-04-19T03:00:00Z', 'America/New_York')).toBe('18-04-2026');
    expect(toSetlistDate('2026-04-19T03:00:00Z', 'Asia/Tokyo')).toBe('19-04-2026');
  });

  it('falls back to UTC rather than the host timezone', () => {
    // Deterministic regardless of where this runs — the bug this guards against
    // only appears when the server and the developer are in different zones.
    expect(toSetlistDate('2026-04-19T03:00:00Z', null)).toBe('19-04-2026');
    expect(toSetlistDate('2026-04-19T03:00:00Z')).toBe('19-04-2026');
  });

  it('zero-pads single-digit days and months', () => {
    expect(toSetlistDate('2026-01-05T12:00:00Z', 'UTC')).toBe('05-01-2026');
  });
});
