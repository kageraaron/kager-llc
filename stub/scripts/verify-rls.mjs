#!/usr/bin/env node
/**
 * Proves the privacy guarantees hold against a real database.
 *
 * Creates two users, makes them friends, and asserts:
 *   1. B cannot read A's private notes (the core promise).
 *   2. B CAN see A's attendance when visibility = 'friends'.
 *   3. B CANNOT see A's attendance when visibility = 'private'.
 *   4. A stranger (no friendship) sees neither.
 *   5. B cannot read A's stored OAuth tokens.
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

  // A and B become friends. Stranger stays unconnected.
  const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await admin.from('friendships').insert({
    user_low: low,
    user_high: high,
    status: 'accepted',
    requested_by: a.id,
  });

  // A records an attendance visible to friends, plus a private note.
  await admin.from('attendances').insert({
    user_id: a.id,
    event_id: event.id,
    state: 'going',
    visibility: 'friends',
  });
  await admin.from('notes').insert({
    user_id: a.id,
    event_id: event.id,
    body: 'SECRET-NOTE-CONTENT',
  });

  console.log('\nNotes must never be readable by anyone but the owner:');
  {
    const { data } = await b.client.from('notes').select('body').eq('user_id', a.id);
    check('friend B cannot read A\'s note', (data ?? []).length === 0);

    const { data: own } = await a.client.from('notes').select('body').eq('user_id', a.id);
    check('owner A can read their own note', (own ?? []).length === 1);

    const { data: str } = await stranger.client.from('notes').select('body').eq('user_id', a.id);
    check('stranger cannot read A\'s note', (str ?? []).length === 0);
  }

  console.log('\nAttendance visibility:');
  {
    const { data } = await b.client.from('attendances').select('id').eq('user_id', a.id);
    check('friend B sees A\'s friends-visible attendance', (data ?? []).length === 1);

    const { data: str } = await stranger.client.from('attendances').select('id').eq('user_id', a.id);
    check('stranger sees nothing', (str ?? []).length === 0);
  }

  // Flip it to private and re-check.
  await admin.from('attendances').update({ visibility: 'private' }).eq('user_id', a.id);
  {
    const { data } = await b.client.from('attendances').select('id').eq('user_id', a.id);
    check('friend B cannot see A\'s private attendance', (data ?? []).length === 0);
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
