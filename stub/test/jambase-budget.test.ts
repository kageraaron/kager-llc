import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * JamBase bills for every request past its free allowance, so the property
 * that matters is simple: when the ledger says no, or cannot answer, NO
 * request leaves the box.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { JamBaseBudgetError, searchArtists } from '@/lib/providers/jambase';

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.JAMBASE_API_KEY = 'test-key';
  rpc.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, artists: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.JAMBASE_MONTHLY_CALLS;
  delete process.env.JAMBASE_DAILY_CALLS;
});

describe('JamBase call budget', () => {
  it('claims a call, with the caps, before making the request', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await searchArtists('North Atlas Sound');

    expect(rpc).toHaveBeenCalledWith('claim_provider_call', expect.objectContaining({
      p_provider: 'jambase',
      p_month_cap: 900,
      p_day_cap: 100,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes no request once the cap is reached', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(searchArtists('North Atlas Sound')).rejects.toBeInstanceOf(JamBaseBudgetError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no request when the ledger cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    await expect(searchArtists('North Atlas Sound')).rejects.toBeInstanceOf(JamBaseBudgetError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes its caps from the environment, and 0 turns JamBase off', async () => {
    process.env.JAMBASE_MONTHLY_CALLS = '0';
    process.env.JAMBASE_DAILY_CALLS = '20';
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(searchArtists('North Atlas Sound')).rejects.toBeInstanceOf(JamBaseBudgetError);
    expect(rpc).toHaveBeenCalledWith('claim_provider_call', expect.objectContaining({ p_month_cap: 0, p_day_cap: 20 }));
  });
});

describe('past shows', () => {
  it('never asks JamBase about a show that has already happened', async () => {
    // The plan rejects past dates, and the rejected request is still billed.
    const { matchTicket } = await import('@/lib/ingest/match');
    rpc.mockResolvedValue({ data: true, error: null });
    await matchTicket({ artistName: 'North Atlas Sound', venueName: 'Bayside Arena', startsAt: '2020-03-14T20:00:00' }).catch(() => null);

    const jambaseCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('jambase.com'));
    expect(jambaseCalls).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalledWith('claim_provider_call', expect.anything());
  });

  it('does ask about an upcoming show, from today onwards only', async () => {
    const { matchTicket } = await import('@/lib/ingest/match');
    rpc.mockResolvedValue({ data: true, error: null });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, events: [] }), { status: 200 }));
    const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19);
    await matchTicket({ artistName: 'North Atlas Sound', venueName: 'Bayside Arena', startsAt: soon }).catch(() => null);

    const jambaseCalls = fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('jambase.com'));
    expect(jambaseCalls).toHaveLength(1);
    const from = new URL(jambaseCalls[0]).searchParams.get('eventDateFrom');
    expect(from).toBe(new Date().toISOString().slice(0, 10));
  });
});

// Last on purpose: the rejection is remembered for the life of the module.
describe('a rejected JamBase key', () => {
  it('stops claiming calls after a 401, so a dead key cannot drain the cap', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(searchArtists('North Atlas Sound')).rejects.toThrow(/key rejected/);
    await expect(searchArtists('North Atlas Sound')).rejects.toThrow(/not retrying/);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
