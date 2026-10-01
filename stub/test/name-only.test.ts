import { beforeEach, describe, expect, it, vi } from 'vitest';

const { matchTicket, persistCandidate } = vi.hoisted(() => ({ matchTicket: vi.fn(), persistCandidate: vi.fn() }));
vi.mock('@/lib/ingest/match', async (orig) => ({ ...(await orig<typeof import('@/lib/ingest/match')>()), matchTicket }));
vi.mock('@/lib/ingest/catalog', () => ({ persistCandidate }));

import { findShowByName, namedShow } from '@/lib/ingest/nameOnly';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { axsFestivalOrder } from './fixtures/emails';

/** A festival order with no event date anywhere, received "now" so its show is still ahead. */
const email = normalizeEmail({ ...axsFestivalOrder, receivedAt: new Date(Date.now() - 86_400_000).toISOString() });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** Just enough of the Supabase client: each table answers with fixed rows. */
function fakeDb(tables: Record<string, unknown[]>) {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'lte', 'eq', 'limit']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[0] ?? null });
    q.then = (ok: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(ok);
    return q;
  };
  return { from: (t: string) => chain(tables[t] ?? []) } as never;
}

const cand = (over: Record<string, unknown>) => ({
  candidate: { source: 'ticketmaster', id: 'x', name: 'Harborlight 2026', artistName: null, startsAt: inDays(120), venueName: 'Dock 12', city: 'San Francisco', raw: {}, ...over },
  confidence: 0.9,
  rawConfidence: 0.9,
  reasons: [],
});

beforeEach(() => {
  matchTicket.mockReset().mockResolvedValue({ best: null, autoAdd: false, alternatives: [], consulted: [] });
  persistCandidate.mockReset().mockResolvedValue('event-from-provider');
});

describe('naming the show', () => {
  it('takes the name from a confirmation that has no date', () => {
    expect(namedShow(email)).toBe('Harborlight');
  });

  it('has nothing to say about mail that is not a confirmation, or names no act', () => {
    expect(namedShow(normalizeEmail({ ...axsFestivalOrder, subject: 'Just Announced: Harborlight' }))).toBeNull();
    expect(namedShow(normalizeEmail({ ...axsFestivalOrder, subject: 'Thank you for your order' }))).toBeNull();
    expect(namedShow(normalizeEmail({ ...axsFestivalOrder, subject: 'Your ticket transfer for Harborlight is on its way to Sam' }))).toBeNull();
  });
});

describe('asking the catalog', () => {
  it('uses a show Stub already knows, edition year and all, without asking a provider', async () => {
    const db = fakeDb({ events: [
      { id: 'e1', name: 'Harborlight 2026', starts_at: inDays(120), headliner: null, venue: { name: 'Dock 12' } },
      { id: 'e2', name: 'Some Other Night', starts_at: inDays(30), headliner: { name: 'Marlow' }, venue: null },
    ] });
    expect(await findShowByName(db, 'Harborlight', email, 'u1')).toMatchObject({ eventId: 'e1', venueName: 'Dock 12', via: 'catalog' });
    expect(matchTicket).not.toHaveBeenCalled();
  });

  it('asks the providers when Stub does not know it, and takes a single answer', async () => {
    matchTicket.mockResolvedValue({ best: null, autoAdd: false, consulted: [], alternatives: [cand({}), cand({ source: 'jambase', id: 'y' })] });
    // Two providers, one show.
    expect(await findShowByName(fakeDb({}), 'Harborlight', email, 'u1')).toMatchObject({ eventId: 'event-from-provider', via: 'provider' });
    expect(matchTicket).toHaveBeenCalledWith({ artistName: 'Harborlight' });
  });

  it('says nothing when the name is a tour with several dates and none is at home', async () => {
    matchTicket.mockResolvedValue({ best: null, autoAdd: false, consulted: [], alternatives: [
      cand({ name: 'Harborlight', venueName: 'Hall A', city: 'Denver', startsAt: inDays(40) }),
      cand({ name: 'Harborlight', venueName: 'Hall B', city: 'Austin', startsAt: inDays(60) }),
    ] });
    expect(await findShowByName(fakeDb({ profiles: [{ home_city: 'San Francisco, CA' }] }), 'Harborlight', email, 'u1')).toBeNull();
    expect(persistCandidate).not.toHaveBeenCalled();
  });

  it('picks the one date in the reader\'s own city', async () => {
    matchTicket.mockResolvedValue({ best: null, autoAdd: false, consulted: [], alternatives: [
      cand({ name: 'Harborlight', venueName: 'Hall A', city: 'Denver', startsAt: inDays(40) }),
      cand({ name: 'Harborlight', venueName: 'Dock 12', city: 'San Francisco', startsAt: inDays(60) }),
    ] });
    await findShowByName(fakeDb({ profiles: [{ home_city: 'San Francisco, CA' }] }), 'Harborlight', email, 'u1');
    expect(persistCandidate.mock.calls[0][1]).toMatchObject({ venueName: 'Dock 12' });
  });

  it('ignores shows before the purchase, far in the future, or with another name', async () => {
    matchTicket.mockResolvedValue({ best: null, autoAdd: false, consulted: [], alternatives: [
      cand({ startsAt: inDays(-30) }),
      cand({ startsAt: inDays(900) }),
      cand({ name: 'Harbor Nights', startsAt: inDays(50) }),
    ] });
    expect(await findShowByName(fakeDb({}), 'Harborlight', email, 'u1')).toBeNull();
  });

  it('does not ask a provider about an email old enough that its show has passed', async () => {
    const old = normalizeEmail({ ...axsFestivalOrder, receivedAt: '2023-01-10T17:00:00Z' });
    expect(await findShowByName(fakeDb({}), 'Harborlight', old, 'u1')).toBeNull();
    expect(matchTicket).not.toHaveBeenCalled();
  });
});
