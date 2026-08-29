import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getUpcoming,
  getArchive,
  getFriendsPlans,
  getFriendsAtEvent,
  getFriendsAtEvents,
  getEvent,
  getMyAttendance,
  getNote,
  getPendingCount,
} from '@/lib/queries';

/**
 * Live integration test against a seeded Supabase project.
 *
 * This is the only test that exercises the real PostgREST embedded joins and the
 * RLS policies - the unit tests cover parsing, not data access. It signs in as
 * the seeded demo account and asserts the exact shape supabase/seed.sql creates.
 *
 * Skipped unless LIVE_TEST=1 and the Supabase env vars are present, so `npm test`
 * stays offline and fast:
 *
 *   LIVE_TEST=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_... \
 *   npx vitest run test/live-queries.test.ts
 *
 * Requires the seed to have been applied, and will fail loudly if the data has
 * drifted - which is the point.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = process.env.LIVE_TEST === '1' && !!URL && !!KEY;

const DEMO_ID = '00000000-0000-4000-8000-000000000001';
const QUINN_ID = '00000000-0000-4000-8000-000000000004';
const E_JBREKKIE = '30000000-0000-4000-8000-000000000001';
const E_BIGTHIEF = '30000000-0000-4000-8000-000000000004';

describe.skipIf(!enabled)('live queries against seeded project', () => {
  let db: SupabaseClient;

  beforeAll(async () => {
    db = createClient(URL!, KEY!, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({
      email: 'demo@stub.local',
      password: 'stubdemo123',
    });
    if (error) throw new Error(`seeded sign-in failed: ${error.message}`);
  });

  it('getUpcoming returns the 4 future shows, soonest first', async () => {
    const rows = await getUpcoming(db, DEMO_ID);
    expect(rows).toHaveLength(4);

    // Embedded joins must actually populate, not come back null.
    expect(rows[0].event.headliner?.name).toBe('Japanese Breakfast');
    expect(rows[0].event.venue?.name).toBe('The Fillmore');
    expect(rows[0].event.venue?.city).toBe('San Francisco');
    expect(rows[0].event.tm_id).toBe('TMSEED01');

    // Ordering by the embedded table is the syntax most likely to be wrong.
    const times = rows.map((r) => new Date(r.event.starts_at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // Only future events; the archive must not bleed in.
    expect(times[0]).toBeGreaterThan(Date.now());

    // Ticket metadata from the "gmail" source survives the join.
    const jb = rows.find((r) => r.event.id === E_JBREKKIE)!;
    expect(jb.source).toBe('gmail');
    expect(jb.ticket_ref).toBe('38-41225/SF3');
    expect(jb.price_cents).toBe(12850);
  });

  it('getArchive returns the 3 past shows, newest first', async () => {
    const rows = await getArchive(db, DEMO_ID);
    // Mitski (relative -21d), Alvvays (relative -95d), and the Tokyo Mitski show
    // pinned to a real date so the setlist.fm lookup has something to find.
    expect(rows).toHaveLength(3);
    expect(rows[0].event.headliner?.name).toBe('Mitski');
    expect(rows.map((r) => r.event.venue?.name)).toContain('Zepp DiverCity (TOKYO)');

    const times = rows.map((r) => new Date(r.event.starts_at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(times[0]).toBeLessThan(Date.now());
  });

  it('getFriendsAtEvent excludes non-friends', async () => {
    const friends = await getFriendsAtEvent(db, E_JBREKKIE, DEMO_ID);
    const handles = friends.map((f) => f.profile.handle).sort();

    // Sasha is going to this show but is NOT an accepted friend. If she appears,
    // are_friends() or the attendances policy is wrong.
    expect(handles).toEqual(['dev_okafor', 'marisol']);
    expect(handles).not.toContain('sasha_lin');
  });

  it('getFriendsAtEvents batches to the same answer as the per-event query', async () => {
    // `/upcoming` swapped a query-per-row for one `.in()`. RLS is evaluated
    // per row either way, but this is exactly the kind of PostgREST rewrite
    // that has silently changed results in this codebase before (see the
    // embedded-`.order()` no-op), so assert the two agree row for row.
    const upcoming = await getUpcoming(db, DEMO_ID);
    const ids = upcoming.map((r) => r.event.id);
    const batched = await getFriendsAtEvents(db, ids, DEMO_ID);

    for (const id of ids) {
      const one = (await getFriendsAtEvent(db, id, DEMO_ID)).map((f) => f.profile.handle).sort();
      const many = (batched.get(id) ?? []).map((f) => f.profile.handle).sort();
      expect(many).toEqual(one);
    }

    // Not merely equal-and-empty: the seed has friends on this show.
    expect(batched.get(E_JBREKKIE)?.map((f) => f.profile.handle).sort())
      .toEqual(['dev_okafor', 'marisol']);

    // An empty input must not turn into an unfiltered query.
    expect((await getFriendsAtEvents(db, [], DEMO_ID)).size).toBe(0);
  });

  it('getFriendsPlans groups friends by event and omits my own shows', async () => {
    const plans = await getFriendsPlans(db, DEMO_ID);
    const byName = new Map(plans.map((p) => [p.event.headliner?.name, p]));

    expect(byName.get('Wednesday')?.friends.map((f) => f.handle).sort())
      .toEqual(['dev_okafor', 'marisol']);
    expect(byName.get('Sunset Rollercoaster')?.friends.map((f) => f.handle))
      .toEqual(['dev_okafor']);

    // Quinn's Big Thief attendance is private, so it must not surface here.
    expect(byName.has('Big Thief')).toBe(false);
  });

  it('notes are readable only by their owner', async () => {
    const mine = await getNote(db, E_JBREKKIE, DEMO_ID);
    expect(mine?.body).toContain('taqueria');

    // Marisol and Dev both have a tripwire note on this same event.
    const { data: allNotes } = await db.from('notes').select('body');
    expect(allNotes).toHaveLength(2);
    expect(allNotes!.every((n) => !n.body.includes('RLS IS BROKEN'))).toBe(true);
  });

  it('another user\'s private attendance is invisible', async () => {
    const { data } = await db
      .from('attendances')
      .select('id')
      .eq('user_id', QUINN_ID)
      .eq('event_id', E_BIGTHIEF);
    expect(data).toHaveLength(0);
  });

  it('getEvent and getMyAttendance resolve a single event', async () => {
    const event = await getEvent(db, E_JBREKKIE);
    expect(event?.name).toBe('Japanese Breakfast');
    expect(event?.venue?.region).toBe('CA');

    const att = await getMyAttendance(db, E_JBREKKIE, DEMO_ID);
    expect(att?.state).toBe('going');
    expect(att?.seat_info).toBe('GA');
  });

  it('getPendingCount sees both review-queue candidates', async () => {
    expect(await getPendingCount(db, DEMO_ID)).toBe(2);
  });

  it('encrypted token columns are not selectable by the client', async () => {
    const { error } = await db.from('email_accounts').select('access_token');
    expect(error).not.toBeNull();
  });
});
