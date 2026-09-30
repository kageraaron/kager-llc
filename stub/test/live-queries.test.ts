import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getUpcoming,
  getArchive,
  getEvent,
  getAttendance,
  getNote,
  getPendingCount,
} from '@/lib/queries';
import { getHouseholdId, getHouseholdMembers } from '@/lib/household';

/**
 * Live integration test against a seeded Supabase project.
 *
 * This is the only test that exercises the real PostgREST embedded joins and the
 * RLS policies - the unit tests cover parsing, not data access. It signs in as
 * the seeded demo account and asserts the exact shape supabase/seed.sql creates:
 * a household of @you and @marisol, plus outsiders whose rows are tripwires.
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
const MARISOL_ID = '00000000-0000-4000-8000-000000000002';
const QUINN_ID = '00000000-0000-4000-8000-000000000004';
const E_JBREKKIE = '30000000-0000-4000-8000-000000000001';
const E_BIGTHIEF = '30000000-0000-4000-8000-000000000004';
const E_WEDNESDAY = '30000000-0000-4000-8000-000000000007';

describe.skipIf(!enabled)('live queries against seeded project', () => {
  let db: SupabaseClient;
  let householdId: string;

  beforeAll(async () => {
    db = createClient(URL!, KEY!, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({
      email: 'demo@stub.local',
      password: 'stubdemo123',
    });
    if (error) throw new Error(`seeded sign-in failed: ${error.message}`);
    householdId = await getHouseholdId(db, DEMO_ID);
  });

  it('the household is @you and @marisol, both admins', async () => {
    const members = await getHouseholdMembers(db, householdId);
    expect(members.map((m) => m.user_id).sort()).toEqual([DEMO_ID, MARISOL_ID]);
    expect(members.every((m) => m.role === 'admin')).toBe(true);
    expect(members.map((m) => m.profile?.handle).sort()).toEqual(['marisol', 'you']);
  });

  it('getUpcoming returns the household\'s 4 future shows, soonest first', async () => {
    const rows = await getUpcoming(db, householdId);
    expect(rows).toHaveLength(4);

    // Wednesday came from Marisol's side of the merge; Big Thief and Sunset
    // Rollercoaster belong to outsiders and must not appear.
    const ids = rows.map((r) => r.event.id);
    expect(ids).toContain(E_WEDNESDAY);
    expect(ids).not.toContain(E_BIGTHIEF);

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
    const rows = await getArchive(db, householdId);
    // Mitski (relative -21d), Alvvays (relative -95d), and the Tokyo Mitski show
    // pinned to a real date so the setlist.fm lookup has something to find.
    expect(rows).toHaveLength(3);
    expect(rows[0].event.headliner?.name).toBe('Mitski');
    expect(rows.map((r) => r.event.venue?.name)).toContain('Zepp DiverCity (TOKYO)');

    const times = rows.map((r) => new Date(r.event.starts_at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(times[0]).toBeLessThan(Date.now());
  });

  it('notes are shared within the household and nowhere else', async () => {
    const mine = await getNote(db, E_JBREKKIE, householdId);
    expect(mine?.body).toContain('taqueria');

    // Written by Marisol before she joined; merged across.
    const hers = await getNote(db, E_WEDNESDAY, householdId);
    expect(hers?.body).toContain('earplugs');

    // Dev and Quinn have tripwire notes on shows this household also has.
    const { data: allNotes } = await db.from('notes').select('body');
    expect(allNotes).toHaveLength(3);
    expect(allNotes!.every((n) => !n.body.includes('RLS IS BROKEN'))).toBe(true);
  });

  it('an outsider\'s attendance is invisible', async () => {
    const { data } = await db
      .from('attendances')
      .select('id')
      .eq('user_id', QUINN_ID)
      .eq('event_id', E_BIGTHIEF);
    expect(data).toHaveLength(0);

    // Every attendance visible at all is this household's.
    const { data: all } = await db.from('attendances').select('household_id');
    expect(all!.every((r) => r.household_id === householdId)).toBe(true);
  });

  it('getEvent and getAttendance resolve a single event', async () => {
    const event = await getEvent(db, E_JBREKKIE);
    expect(event?.name).toBe('Japanese Breakfast');
    expect(event?.venue?.region).toBe('CA');

    const att = await getAttendance(db, E_JBREKKIE, householdId);
    expect(att?.state).toBe('going');
    expect(att?.seat_info).toBe('GA');
    // Marisol's ticket count survived the merge onto your row.
    expect(att?.ticket_quantity).toBe(2);
  });

  it('getPendingCount sees both review-queue candidates', async () => {
    expect(await getPendingCount(db, householdId)).toBe(2);
  });

  it('encrypted token columns are not selectable by the client', async () => {
    const { error } = await db.from('email_accounts').select('access_token');
    expect(error).not.toBeNull();
  });
});
