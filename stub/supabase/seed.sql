-- Stub — seed data: four test accounts, all friends with each other.
--
--   demo@stub.local     / stubdemo123   @you       <- sign in as this one
--   marisol@stub.local  / stubdemo123   @marisol
--   dev@stub.local      / stubdemo123   @dev_okafor
--   quinn@stub.local    / stubdemo123   @quinn
--
-- Plus one NON-friend (@sasha_lin) with a pending request to @you, so the
-- friend-request flow and the stranger case both have real data behind them.
--
-- Everything here runs the real code paths: the PostgREST embedded joins in
-- src/lib/queries.ts, the RLS policies, and the are_friends() function. If a
-- page renders correctly against this, it genuinely works.
--
-- Apply with `supabase db reset` (runs migrations then this file), or paste
-- into the SQL editor of a throwaway cloud project.
--
-- SAFE TO RE-RUN: idempotent on fixed UUIDs.
-- NEVER run against a database with real data.

-- ============================================================ accounts

do $$
declare
  u_you     uuid := '00000000-0000-4000-8000-000000000001';
  u_marisol uuid := '00000000-0000-4000-8000-000000000002';
  u_dev     uuid := '00000000-0000-4000-8000-000000000003';
  u_quinn   uuid := '00000000-0000-4000-8000-000000000004';
  u_sasha   uuid := '00000000-0000-4000-8000-000000000005';

  acct record;
  a uuid;
  b uuid;
  friend_ids uuid[];
begin
  -- The handle_new_user trigger creates each profile row for us.
  for acct in
    select * from (values
      (u_you,     'demo@stub.local',    'Demo Listener'),
      (u_marisol, 'marisol@stub.local', 'Marisol Vega'),
      (u_dev,     'dev@stub.local',     'Dev Okafor'),
      (u_quinn,   'quinn@stub.local',   'Quinn Hart'),
      (u_sasha,   'sasha@stub.local',   'Sasha Lin')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000', acct.id, 'authenticated', 'authenticated',
      acct.email, extensions.crypt('stubdemo123', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', acct.full_name),
      '', '', '', ''
    )
    on conflict (id) do nothing;
  end loop;

  -- Readable handles and bios in place of the auto-generated ones.
  update profiles set handle='you',        display_name='Demo Listener', home_city='San Francisco, CA',
    bio='Trying to see 40 shows this year. Mostly indie rock, occasionally techno at 2am.' where id=u_you;
  update profiles set handle='marisol',    display_name='Marisol Vega',  home_city='Oakland, CA',
    bio='Front rail or nothing.' where id=u_marisol;
  update profiles set handle='dev_okafor', display_name='Dev Okafor',    home_city='San Francisco, CA',
    bio='Will drive four hours for a good support act.' where id=u_dev;
  update profiles set handle='quinn',      display_name='Quinn Hart',    home_city='Berkeley, CA',
    bio='Shoegaze, mostly. Earplugs always.' where id=u_quinn;
  update profiles set handle='sasha_lin',  display_name='Sasha Lin',     home_city='Los Angeles, CA',
    bio='New here.' where id=u_sasha;

  -- Every pair among the four is an accepted friendship (6 pairs), stored
  -- canonically so user_low < user_high always holds.
  friend_ids := array[u_you, u_marisol, u_dev, u_quinn];
  for i in 1..array_length(friend_ids, 1) loop
    for j in (i + 1)..array_length(friend_ids, 1) loop
      a := least(friend_ids[i], friend_ids[j]);
      b := greatest(friend_ids[i], friend_ids[j]);
      insert into friendships (user_low, user_high, status, requested_by)
      values (a, b, 'accepted', friend_ids[i])
      on conflict (user_low, user_high) do update set status = 'accepted';
    end loop;
  end loop;

  -- Sasha has a PENDING request out to you, so the Requests section is populated.
  insert into friendships (user_low, user_high, status, requested_by)
  values (least(u_you, u_sasha), greatest(u_you, u_sasha), 'pending', u_sasha)
  on conflict (user_low, user_high) do update set status = 'pending';
end $$;

-- ============================================================ catalog

-- tm_id and image_url are REAL Ticketmaster values, looked up by name. The
-- first version of this seed used invented ids that happened to collide with
-- other artists' attractions (K8vZ9171Ck0 is Disney On Ice, not Turnstile),
-- so anything resolving by tm_id fetched the wrong act.
insert into artists (id, tm_id, name, genres, image_url) values
  ('10000000-0000-4000-8000-000000000001', 'K8vZ917fRQ0', 'Japanese Breakfast', '{Rock,Indie}', 'https://s1.ticketm.net/dam/a/d5e/ea27dcf2-30b5-45e0-8a53-61a552933d5e_RETINA_PORTRAIT_3_2.jpg'),
  ('10000000-0000-4000-8000-000000000002', 'K8vZ9173bFV', 'Turnstile', '{Rock,Punk}', 'https://s1.ticketm.net/dam/a/a37/9a486633-4306-4fcb-a0ea-3e4c84d01a37_RETINA_PORTRAIT_16_9.jpg'),
  ('10000000-0000-4000-8000-000000000003', 'K8vZ9179LP7', 'Fontaines D.C.', '{Rock,Alternative}', 'https://s1.ticketm.net/dam/a/bca/2bbd924a-fead-4c53-b6d6-1ab4d097cbca_RETINA_PORTRAIT_3_2.jpg'),
  ('10000000-0000-4000-8000-000000000004', 'K8vZ917Kkx0', 'Mitski', '{Rock,Indie}', 'https://s1.ticketm.net/dam/a/c8d/48852c5f-9627-4cdc-a86b-7df526ee8c8d_RETINA_PORTRAIT_16_9.jpg'),
  ('10000000-0000-4000-8000-000000000005', 'K8vZ9173Naf', 'Alvvays', '{Rock,Indie}', 'https://s1.ticketm.net/dam/a/ec8/3f453c5d-987f-473b-9f2a-eb41677ceec8_RETINA_PORTRAIT_3_2.jpg'),
  ('10000000-0000-4000-8000-000000000006', 'K8vZ917K5F0', 'Big Thief', '{Rock,Folk}', 'https://s1.ticketm.net/dam/a/a53/cb8b3235-2bcb-4995-93bd-da0dda12aa53_RETINA_PORTRAIT_3_2.jpg'),
  ('10000000-0000-4000-8000-000000000007', 'K8vZ917_sEV', 'Wednesday', '{Rock,Indie}', 'https://s1.ticketm.net/dam/a/698/4d5ac8e8-1c1a-4e21-8c17-f5b7b6913698_RETINA_PORTRAIT_3_2.jpg'),
  ('10000000-0000-4000-8000-000000000008', 'K8vZ9173nY0', 'Slowdive', '{Rock,Shoegaze}', 'https://s1.ticketm.net/dam/a/2d3/aaccfee5-ceed-481d-8724-5dc92a73d2d3_RETINA_PORTRAIT_3_2.jpg'),
  ('10000000-0000-4000-8000-000000000009', 'K8vZ9179on7', 'Sunset Rollercoaster', '{Rock,Indie}', 'https://s1.ticketm.net/dam/a/f86/25d3b4f1-6307-4621-9078-0fa42e3ccf86_1670551_RETINA_PORTRAIT_3_2.jpg')
on conflict (id) do nothing;

insert into venues (id, tm_id, name, city, region, country, timezone) values
  ('20000000-0000-4000-8000-000000000001', 'KovZpZAEAAEA', 'The Fillmore',              'San Francisco', 'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000002', 'KovZpZAJledA', 'The Wiltern',               'Los Angeles',   'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000003', 'KovZpZA7AAEA', 'Brooklyn Steel',            'Brooklyn',      'NY', 'US', 'America/New_York'),
  ('20000000-0000-4000-8000-000000000004', 'KovZpZAJ6evA', 'The Masonic',               'San Francisco', 'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000005', 'KovZpZAdFtaA', 'The Independent',           'San Francisco', 'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000006', 'KovZpZAE6eeA', 'The Regency Ballroom',      'San Francisco', 'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000007', 'KovZpZAJ71dA', 'Bottom of the Hill',        'San Francisco', 'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000008', 'KovZpZAaFnEA', 'The Fox Theater',           'Oakland',       'CA', 'US', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000009', 'KovZpZAJ6eaA', 'Music Hall of Williamsburg','Brooklyn',      'NY', 'US', 'America/New_York')
on conflict (id) do nothing;

-- Relative dates, so the Upcoming/Archive split stays correct however long
-- after seeding you look at it.
insert into events (id, tm_id, name, headliner_id, venue_id, starts_at, timezone, status, url) values
  ('30000000-0000-4000-8000-000000000001', 'TMSEED01', 'Japanese Breakfast',   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() + interval  '6 days', 'America/Los_Angeles', 'onsale',    'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000002', 'TMSEED02', 'Turnstile',            '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', now() + interval '19 days', 'America/Los_Angeles', 'onsale',    'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000003', 'TMSEED03', 'Fontaines D.C.',       '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', now() + interval '34 days', 'America/New_York',    'onsale',    'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000004', 'TMSEED04', 'Big Thief',            '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', now() + interval '96 days', 'America/Los_Angeles', 'onsale',    'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000005', 'TMSEED05', 'Mitski',               '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', now() - interval '21 days', 'America/Los_Angeles', 'completed', 'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000006', 'TMSEED06', 'Alvvays',              '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', now() - interval '95 days', 'America/Los_Angeles', 'completed', 'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000007', 'TMSEED07', 'Wednesday',            '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', now() + interval '12 days', 'America/Los_Angeles', 'onsale',    'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000008', 'TMSEED08', 'Slowdive',             '10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', now() - interval '52 days', 'America/Los_Angeles', 'completed', 'https://www.ticketmaster.com'),
  ('30000000-0000-4000-8000-000000000009', 'TMSEED09', 'Sunset Rollercoaster', '10000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', now() + interval '52 days', 'America/New_York',    'onsale',    'https://www.ticketmaster.com')
on conflict (id) do nothing;

-- One archive show pinned to a REAL date and venue, so the setlist.fm lookup
-- has something to find. Every other seeded event uses relative dates to keep
-- the Upcoming/Archive split correct; this one is deliberately fixed, because a
-- setlist only exists for a show that actually happened.
insert into venues (id, tm_id, name, city, region, country, timezone) values
  ('20000000-0000-4000-8000-000000000010', null, 'Zepp DiverCity (TOKYO)', 'Tokyo', null, 'JP', 'Asia/Tokyo')
on conflict (id) do nothing;

insert into events (id, tm_id, name, headliner_id, venue_id, starts_at, timezone, status, image_url)
select '30000000-0000-4000-8000-000000000010', null, 'Mitski', a.id,
       '20000000-0000-4000-8000-000000000010',
       timestamptz '2026-07-28 19:00:00+09', 'Asia/Tokyo', 'completed', a.image_url
from artists a where a.name = 'Mitski'
on conflict (id) do nothing;

insert into event_artists (event_id, artist_id, billing)
select id, headliner_id, 'headliner' from events where headliner_id is not null
on conflict (event_id, artist_id) do nothing;

-- Events show their headliner's artwork unless they carry their own.
update events e set image_url = a.image_url
from artists a where e.headliner_id = a.id and e.image_url is null;

-- ============================================================ attendances

do $$
declare
  u_you     uuid := '00000000-0000-4000-8000-000000000001';
  u_marisol uuid := '00000000-0000-4000-8000-000000000002';
  u_dev     uuid := '00000000-0000-4000-8000-000000000003';
  u_quinn   uuid := '00000000-0000-4000-8000-000000000004';
  u_sasha   uuid := '00000000-0000-4000-8000-000000000005';

  e_jbrekkie uuid := '30000000-0000-4000-8000-000000000001';
  e_turnstile uuid := '30000000-0000-4000-8000-000000000002';
  e_fontaines uuid := '30000000-0000-4000-8000-000000000003';
  e_bigthief  uuid := '30000000-0000-4000-8000-000000000004';
  e_mitski    uuid := '30000000-0000-4000-8000-000000000005';
  e_alvvays   uuid := '30000000-0000-4000-8000-000000000006';
  e_wednesday uuid := '30000000-0000-4000-8000-000000000007';
  e_slowdive  uuid := '30000000-0000-4000-8000-000000000008';
  e_sunset    uuid := '30000000-0000-4000-8000-000000000009';
begin
  -- YOU. Mixed sources so the Upcoming source badges are exercised. Big Thief
  -- is deliberately private, to prove friends cannot see it on your profile.
  insert into attendances (user_id, event_id, state, visibility, source, ticket_ref, seat_info, price_cents, purchased_at) values
    (u_you, e_jbrekkie,  'going', 'friends', 'gmail',     '38-41225/SF3', 'GA', 12850, now() - interval '30 days'),
    (u_you, e_turnstile, 'going', 'friends', 'gmail',     'AXS-99120B',   null,  9400, now() - interval '12 days'),
    (u_you, e_fontaines, 'going', 'friends', 'manual',    null,           null,  null, null),
    (u_you, e_bigthief,  'going', 'private', 'manual',    null,           null,  null, null),
    (u_you, e_mitski,    'went',  'friends', 'setlistfm', null,           null,  null, null),
    (u_you, e_alvvays,   'went',  'friends', 'manual',    null,           null,  null, null),
    -- The pinned Tokyo show, so /event/... renders a real 28-song setlist.
    (u_you, '30000000-0000-4000-8000-000000000010', 'went', 'friends', 'setlistfm', null, null, null, null)
  on conflict (user_id, event_id) do nothing;

  -- MARISOL overlaps on two of your shows, and has one of her own.
  insert into attendances (user_id, event_id, state, visibility, source) values
    (u_marisol, e_jbrekkie,  'going', 'friends', 'manual'),
    (u_marisol, e_mitski,    'went',  'friends', 'manual'),
    (u_marisol, e_wednesday, 'going', 'friends', 'manual')
  on conflict (user_id, event_id) do nothing;

  -- DEV overlaps on Japanese Breakfast too, so that card shows a 2-avatar stack.
  insert into attendances (user_id, event_id, state, visibility, source) values
    (u_dev, e_jbrekkie,  'going',      'friends', 'manual'),
    (u_dev, e_wednesday, 'going',      'friends', 'manual'),
    (u_dev, e_sunset,    'interested', 'friends', 'manual'),
    (u_dev, e_slowdive,  'went',       'friends', 'manual')
  on conflict (user_id, event_id) do nothing;

  -- QUINN shares the Turnstile date, and has a private one of her own.
  insert into attendances (user_id, event_id, state, visibility, source) values
    (u_quinn, e_turnstile, 'going', 'friends', 'manual'),
    (u_quinn, e_slowdive,  'went',  'friends', 'manual'),
    (u_quinn, e_bigthief,  'going', 'private', 'manual')
  on conflict (user_id, event_id) do nothing;

  -- SASHA is NOT your friend. None of this may ever appear in your UI.
  insert into attendances (user_id, event_id, state, visibility, source) values
    (u_sasha, e_jbrekkie, 'going', 'friends', 'manual')
  on conflict (user_id, event_id) do nothing;

  -- ---------------------------------------------------------- private notes
  -- Notes exist for several users on shows you also attend. Only your own may
  -- ever render; the others are tripwires.
  insert into notes (user_id, event_id, body) values
    (u_you,     e_jbrekkie, 'Marisol has the tickets. Meet at 7 at the taqueria on Fillmore first.'),
    (u_you,     e_mitski,   'Opened with Bug Like an Angel and the whole room went quiet. Best show of the year.'),
    (u_marisol, e_jbrekkie, 'IF YOU CAN READ THIS, RLS IS BROKEN.'),
    (u_dev,     e_jbrekkie, 'IF YOU CAN READ THIS, RLS IS BROKEN.'),
    (u_quinn,   e_turnstile,'IF YOU CAN READ THIS, RLS IS BROKEN.')
  on conflict (user_id, event_id) do nothing;

  -- ---------------------------------------------------------- inbox queue
  -- Both review cases: an uncertain match, and a parsed email with no match.
  insert into ingest_messages (id, user_id, from_addr, subject, received_at, content_hash, extractor, status) values
    ('40000000-0000-4000-8000-000000000001', u_you, 'hello@mail.dice.fm', 'You''re going to Fontaines D.C.', now() - interval '3 days', 'seedhash-dice-0001', 'dice',   'parsed'),
    ('40000000-0000-4000-8000-000000000002', u_you, 'noreply@etix.com',   'Order Confirmation: Hovvdy',     now() - interval '1 day',  'seedhash-etix-0002', 'jsonld', 'unmatched')
  on conflict (id) do nothing;

  insert into ingest_candidates (id, message_id, user_id, parsed, confidence, matched_event_id, state) values
    (
      '50000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001', u_you,
      '{"artistName":"Fontaines D.C.","venueName":"Brooklyn Steel","city":"Brooklyn","ticketRef":"DICE7781QQ"}'::jsonb,
      0.62, e_fontaines, 'pending'
    ),
    (
      '50000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002', u_you,
      '{"artistName":"Hovvdy","venueName":"The Chapel","city":"San Francisco","ticketRef":"ETX-55120"}'::jsonb,
      0, null, 'pending'
    )
  on conflict (id) do nothing;

  -- ---------------------------------------------------------- favourites
  insert into user_artists (user_id, artist_id, source) values
    (u_you,   '10000000-0000-4000-8000-000000000001', 'spotify'),
    (u_you,   '10000000-0000-4000-8000-000000000004', 'spotify'),
    (u_you,   '10000000-0000-4000-8000-000000000006', 'spotify'),
    (u_quinn, '10000000-0000-4000-8000-000000000008', 'spotify')
  on conflict (user_id, artist_id, source) do nothing;
end $$;

-- ============================================================ what to expect
--
-- Signed in as demo@stub.local you should see:
--
--   Upcoming  4 shows. Japanese Breakfast and Turnstile badged "From Gmail".
--             Japanese Breakfast shows a 2-avatar stack (Marisol + Dev) —
--             NOT 3, because Sasha is not your friend.
--   Archive   2 shows, grouped by year.
--   Inbox     badge "2"; one 62% match, one "No match found".
--   Friends   3 friends, 1 pending request from Sasha, and "what your friends
--             are going to" listing Wednesday (Marisol + Dev) and Sunset
--             Rollercoaster (Dev).
--   Event     Japanese Breakfast shows YOUR note about the taqueria and
--             nothing else. Any "RLS IS BROKEN" text means the policy failed.
--   Profile   /profile/quinn shows her Slowdive show but NOT her private
--             Big Thief one.
