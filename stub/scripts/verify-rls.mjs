#!/usr/bin/env node
/**
 * Proves the privacy guarantees hold against a real database.
 *
 * Creates three users, puts A and B in one household (via a real invite
 * redemption, as the app does), and asserts:
 *   1. B CAN read A's shows and notes: they belong to the household.
 *   2. A stranger sees none of them, nor the household's members.
 *   3. An invite link works once, and only once.
 *   4. B can see A's connected mailbox, but nobody can select token columns.
 *
 * Run against a local Supabase or a throwaway project - it creates and deletes
 * users. Never point it at anything with real data.
 *
 *   node scripts/verify-rls.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

async function makeUser(tag) {
  const email = `rls-${tag}-${Date.now()}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}!A1`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return { id: data.user.id, client };
}

async function main() {
  console.log('Setting up test users...');
  const [a, b, stranger] = await Promise.all([makeUser('a'), makeUser('b'), makeUser('c')]);

  // Seed a venue + event via the service role (catalog is service-role writable).
  const { data: event, error: evErr } = await admin
    .from('events')
    .insert({ name: 'RLS Test Show', starts_at: new Date(Date.now() + 86400000).toISOString() })
    .select('id')
    .single();
  if (evErr) throw evErr;

  // A invites B into A's household. Stranger stays in a household of one.
  const token = `rlstest${Date.now()}`;
  const { data: aMember } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', a.id)
    .single();
  const householdId = aMember.household_id;
  {
    const { error } = await a.client
      .from('household_invites')
      .insert({ token, household_id: householdId, created_by: a.id });
    check('A can create an invite for their household', !error);

    const { error: redeemErr } = await b.client.rpc('redeem_household_invite', { invite_token: token });
    check('B can redeem it', !redeemErr);

    const { error: again } = await stranger.client.rpc('redeem_household_invite', { invite_token: token });
    check('a used invite is refused', again !== null);
  }

  // A records a show and a note, inserting "as a person" like the app does;
  // set_household_id() puts them in the household.
  await a.client.from('attendances').insert({ user_id: a.id, event_id: event.id, state: 'going' });
  await a.client.from('notes').insert({ user_id: a.id, event_id: event.id, body: 'HOUSEHOLD-NOTE' });

  console.log('\nShows and notes are the household\'s:');
  {
    const { data } = await b.client.from('attendances').select('id').eq('event_id', event.id);
    check('member B sees A\'s show', (data ?? []).length === 1);

    const { data: note } = await b.client.from('notes').select('body').eq('event_id', event.id);
    check('member B reads the shared note', note?.[0]?.body === 'HOUSEHOLD-NOTE');

    const { error: editErr } = await b.client
      .from('notes')
      .update({ body: 'EDITED-BY-B' })
      .eq('event_id', event.id);
    check('member B can edit it', !editErr);
  }

  console.log('\nOutsiders see nothing:');
  {
    const { data } = await stranger.client.from('attendances').select('id').eq('event_id', event.id);
    check('stranger cannot see the show', (data ?? []).length === 0);

    const { data: note } = await stranger.client.from('notes').select('body').eq('event_id', event.id);
    check('stranger cannot read the note', (note ?? []).length === 0);

    const { data: members } = await stranger.client
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId);
    check('stranger cannot list the household\'s members', (members ?? []).length === 0);

    const { data: profiles } = await stranger.client.from('profiles').select('id').eq('id', a.id);
    check('stranger cannot read A\'s profile', (profiles ?? []).length === 0);
  }

  console.log('\nToken columns must not be selectable by the client:');
  {
    await admin.from('email_accounts').insert({
      user_id: a.id,
      provider: 'gmail',
      email: 'a@example.test',
      access_token: 'ENCRYPTED-PLACEHOLDER',
      refresh_token: 'ENCRYPTED-PLACEHOLDER',
    });

    const { error } = await a.client.from('email_accounts').select('access_token');
    check('owner A cannot select access_token (column grant)', error !== null);

    const { data: safe } = await a.client.from('email_accounts').select('id, email');
    check('owner A can still list their connected accounts', (safe ?? []).length === 1);

    const { data: shared } = await b.client.from('email_accounts').select('id, email');
    check('member B sees A\'s connected account', (shared ?? []).length === 1);

    const { error: bTok } = await b.client.from('email_accounts').select('refresh_token');
    check('member B cannot select refresh_token', bTok !== null);

    const { data: str } = await stranger.client.from('email_accounts').select('id');
    check('stranger sees no connected accounts', (str ?? []).length === 0);
  }

  console.log('\nCleaning up...');
  await admin.from('events').delete().eq('id', event.id);
  for (const u of [a, b, stranger]) await admin.auth.admin.deleteUser(u.id);

  console.log(failures === 0 ? '\nAll RLS checks passed.' : `\n${failures} RLS CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nverify-rls crashed:', err.message ?? err);
  process.exit(1);
});
