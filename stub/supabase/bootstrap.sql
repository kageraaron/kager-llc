-- Stub — one-shot bootstrap.
--
-- Concatenation of supabase/migrations/*.sql (in order) followed by
-- supabase/seed.sql, for pasting into the Supabase SQL editor or running via
-- the Supabase MCP server in a single call.
--
-- This is a CONVENIENCE FILE, not the source of truth. The migrations directory
-- is authoritative — `supabase db push` and `supabase db reset` use those.
-- Regenerate with: npm run build:bootstrap
--
-- Idempotent and safe to re-run.
-- NEVER run against a database with real data.

-- ============================================================================
-- supabase/migrations/0001_init.sql
-- ============================================================================

-- Stub — initial schema
-- Conventions:
--   * Global cache tables (artists, venues, events, event_artists) are shared across all users:
--     readable by any authenticated user, written only by the service role.
--   * Per-user tables are guarded by RLS keyed on auth.uid().
--   * "Archive" is a query (starts_at < now()), never a separate table.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================ enums

create type attendance_state      as enum ('going', 'interested', 'went', 'missed');
create type attendance_visibility as enum ('friends', 'private');
create type attendance_source     as enum ('manual', 'gmail', 'forward', 'setlistfm', 'friend');
create type friendship_status     as enum ('pending', 'accepted', 'blocked');
create type artist_source         as enum ('manual', 'spotify', 'applemusic', 'setlistfm');
create type email_provider        as enum ('gmail', 'forward');
create type ingest_status         as enum ('parsed', 'unmatched', 'ignored', 'error');
create type candidate_state       as enum ('pending', 'confirmed', 'rejected');
create type billing_role          as enum ('headliner', 'support');

-- ============================================================ profiles

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text unique not null check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '',
  bio          text not null default '' check (char_length(bio) <= 500),
  avatar_url   text,
  home_city    text,
  home_lat     double precision,
  home_lng     double precision,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_handle_trgm on profiles using gin (handle gin_trgm_ops);

-- ============================================================ global catalog

create table artists (
  id           uuid primary key default gen_random_uuid(),
  mbid         uuid unique,                    -- MusicBrainz, our canonical identity
  tm_id        text unique,                    -- Ticketmaster attraction id
  name         text not null,
  sort_name    text,
  image_url    text,
  genres       text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create index artists_name_trgm on artists using gin (name gin_trgm_ops);

create table venues (
  id         uuid primary key default gen_random_uuid(),
  tm_id      text unique,
  name       text not null,
  city       text,
  region     text,
  country    text,
  lat        double precision,
  lng        double precision,
  timezone   text,
  created_at timestamptz not null default now()
);

create table events (
  id            uuid primary key default gen_random_uuid(),
  tm_id         text unique,                   -- Ticketmaster event id
  setlistfm_id  text unique,
  name          text not null,
  headliner_id  uuid references artists(id) on delete set null,
  venue_id      uuid references venues(id) on delete set null,
  starts_at     timestamptz not null,
  doors_at      timestamptz,
  timezone      text,
  status        text not null default 'onsale',
  url           text,
  image_url     text,
  created_at    timestamptz not null default now()
);

create index events_starts_at   on events (starts_at);
create index events_headliner   on events (headliner_id);
create index events_name_trgm   on events using gin (name gin_trgm_ops);

create table event_artists (
  event_id  uuid not null references events(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  billing   billing_role not null default 'support',
  primary key (event_id, artist_id)
);

-- ============================================================ social

-- One row per friendship, stored canonically so (a,b) and (b,a) can't both exist.
create table friendships (
  user_low     uuid not null references profiles(id) on delete cascade,
  user_high    uuid not null references profiles(id) on delete cascade,
  status       friendship_status not null default 'pending',
  requested_by uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendships_canonical check (user_low < user_high)
);

create index friendships_high on friendships (user_high);

-- Are these two users accepted friends? Used by RLS on attendances/profiles.
create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships
    where user_low  = least(a, b)
      and user_high = greatest(a, b)
      and status    = 'accepted'
  );
$$;

-- ============================================================ per-user data

create table user_artists (
  user_id    uuid not null references profiles(id) on delete cascade,
  artist_id  uuid not null references artists(id) on delete cascade,
  source     artist_source not null default 'manual',
  weight     real not null default 1.0,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id, source)
);

create table attendances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  event_id     uuid not null references events(id) on delete cascade,
  state        attendance_state not null default 'going',
  visibility   attendance_visibility not null default 'friends',
  source       attendance_source not null default 'manual',
  ticket_ref   text,
  seat_info    text,
  price_cents  integer,
  purchased_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, event_id)
);

create index attendances_user  on attendances (user_id);
create index attendances_event on attendances (event_id);

-- Private notes. Deliberately a separate table from attendances so that a single
-- blanket RLS policy (owner only, no friend path) governs all note access.
create table notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

-- ============================================================ ingestion

create table email_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  provider       email_provider not null,
  email          text not null,
  access_token   text,                          -- AES-256-GCM, see src/lib/crypto.ts
  refresh_token  text,                          -- AES-256-GCM
  token_expires  timestamptz,
  history_id     text,                          -- Gmail incremental sync cursor
  last_synced_at timestamptz,
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  unique (user_id, provider, email)
);

create table inbound_addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  local_part text unique not null,              -- e.g. 'emily-a3f9'
  created_at timestamptz not null default now()
);

-- We store extracted fields and a content hash, never the raw email body.
create table ingest_messages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  account_id     uuid references email_accounts(id) on delete set null,
  provider_msg_id text,
  from_addr      text,
  subject        text,
  received_at    timestamptz,
  content_hash   text not null,
  extractor      text,
  status         ingest_status not null default 'parsed',
  error          text,
  created_at     timestamptz not null default now(),
  unique (user_id, content_hash)
);

create table ingest_candidates (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references ingest_messages(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  parsed      jsonb not null,
  confidence  real not null,
  matched_event_id uuid references events(id) on delete set null,
  state       candidate_state not null default 'pending',
  created_at  timestamptz not null default now()
);

create index ingest_candidates_user_state on ingest_candidates (user_id, state);

-- ============================================================ updated_at triggers

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch    before update on profiles    for each row execute function touch_updated_at();
create trigger friendships_touch before update on friendships for each row execute function touch_updated_at();
create trigger attendances_touch before update on attendances for each row execute function touch_updated_at();
create trigger notes_touch       before update on notes       for each row execute function touch_updated_at();

-- Create a profile row automatically on signup.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    -- collision-safe default handle; the user renames it in onboarding
    -- truncated to satisfy the 24-char handle check constraint; 15 + 1 + 6 = 22 max
    substr(
      lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9_]', '', 'g')),
      1, 15
    ) || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- supabase/migrations/0002_rls.sql
-- ============================================================================

-- Stub — row level security
--
-- The rule that matters most: `notes` has an owner-only policy with NO friend path.
-- Everything else may be shared; notes never are.

alter table profiles          enable row level security;
alter table artists           enable row level security;
alter table venues            enable row level security;
alter table events            enable row level security;
alter table event_artists     enable row level security;
alter table friendships       enable row level security;
alter table user_artists      enable row level security;
alter table attendances       enable row level security;
alter table notes             enable row level security;
alter table email_accounts    enable row level security;
alter table inbound_addresses enable row level security;
alter table ingest_messages   enable row level security;
alter table ingest_candidates enable row level security;

-- ---------------------------------------------------------- global catalog
-- Readable by any signed-in user. Writes happen via the service role, which
-- bypasses RLS entirely, so no insert/update policies are defined here.

create policy "catalog readable" on artists       for select to authenticated using (true);
create policy "catalog readable" on venues        for select to authenticated using (true);
create policy "catalog readable" on events        for select to authenticated using (true);
create policy "catalog readable" on event_artists for select to authenticated using (true);

-- ---------------------------------------------------------- profiles

-- Any signed-in user can look up a profile: needed to send a friend request by handle.
-- Only non-sensitive columns live on this table, so full-row read is acceptable.
create policy "profiles readable" on profiles
  for select to authenticated using (true);

create policy "own profile writable" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------- friendships

create policy "see own friendships" on friendships
  for select to authenticated
  using (user_low = auth.uid() or user_high = auth.uid());

-- You may only create a request you are part of, and only as the requester.
create policy "request friendship" on friendships
  for insert to authenticated
  with check (
    (user_low = auth.uid() or user_high = auth.uid())
    and requested_by = auth.uid()
    and status = 'pending'
  );

-- Either side may update (accept / block). The other side accepting is the point.
create policy "update own friendship" on friendships
  for update to authenticated
  using (user_low = auth.uid() or user_high = auth.uid())
  with check (user_low = auth.uid() or user_high = auth.uid());

create policy "delete own friendship" on friendships
  for delete to authenticated
  using (user_low = auth.uid() or user_high = auth.uid());

-- ---------------------------------------------------------- user_artists

create policy "own artists" on user_artists
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------- attendances
-- Owner sees everything. Accepted friends see rows marked visibility = 'friends'.
-- This is what powers "which of my friends are going to which concerts".

create policy "own attendances" on attendances
  for select to authenticated using (user_id = auth.uid());

create policy "friends attendances" on attendances
  for select to authenticated
  using (visibility = 'friends' and are_friends(auth.uid(), user_id));

create policy "write own attendances" on attendances
  for insert to authenticated with check (user_id = auth.uid());

create policy "update own attendances" on attendances
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "delete own attendances" on attendances
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------- notes  (owner only)
-- No friend path, by design. Do not add one.

create policy "notes are private" on notes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------- ingestion
-- Tokens are never selectable by the client; only the service role reads them.

create policy "own email accounts" on email_accounts
  for select to authenticated using (user_id = auth.uid());

create policy "delete own email accounts" on email_accounts
  for delete to authenticated using (user_id = auth.uid());

create policy "own inbound address" on inbound_addresses
  for select to authenticated using (user_id = auth.uid());

create policy "own ingest messages" on ingest_messages
  for select to authenticated using (user_id = auth.uid());

create policy "own ingest candidates" on ingest_candidates
  for select to authenticated using (user_id = auth.uid());

-- The review queue: confirming or rejecting a candidate is a client action.
create policy "resolve own candidates" on ingest_candidates
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------- column-level grants
-- RLS is row-level only, so the owner's own policy would still expose the encrypted
-- token columns to the browser client. Restrict the selectable columns explicitly.
-- The service role bypasses both RLS and these grants.

revoke all on email_accounts from authenticated;
grant select (id, user_id, provider, email, last_synced_at, status, created_at)
  on email_accounts to authenticated;
grant delete on email_accounts to authenticated;

-- content_hash is an email fingerprint; no reason to hand it to the client.
revoke all on ingest_messages from authenticated;
grant select (id, user_id, from_addr, subject, received_at, extractor, status, error, created_at)
  on ingest_messages to authenticated;

-- ============================================================================
-- supabase/migrations/0003_storage_and_inbound.sql
-- ============================================================================

-- Avatars bucket + per-user inbound addresses.

-- ============================================================ avatar storage

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Profile photos are public to read (they appear on friend cards), but a user
-- may only write inside a folder named for their own uid.
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users write their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================ inbound addresses

-- Every user gets a forwarding address at signup so the feature is ready the
-- moment FEATURE_FORWARD_INBOX is switched on. The random suffix keeps the
-- address unguessable, since anyone who knows it can post mail into the queue.
-- search_path MUST include `extensions`: Supabase installs pgcrypto there, not
-- in public, and gen_random_bytes() below is a pgcrypto function. With a
-- public-only search_path this trigger raises 42883 on every profile insert,
-- which means every signup fails, not just seeding.
create or replace function assign_inbound_address()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  base text;
  suffix text;
begin
  base := substr(regexp_replace(lower(new.handle), '[^a-z0-9]', '', 'g'), 1, 16);
  if base = '' then base := 'user'; end if;

  suffix := encode(gen_random_bytes(3), 'hex');

  insert into inbound_addresses (user_id, local_part)
  values (new.id, base || '-' || suffix)
  on conflict (local_part) do nothing;

  return new;
end;
$$;

create trigger on_profile_created_assign_inbox
  after insert on profiles
  for each row execute function assign_inbound_address();

-- Backfill anyone who already exists.
insert into inbound_addresses (user_id, local_part)
select
  p.id,
  substr(regexp_replace(lower(p.handle), '[^a-z0-9]', '', 'g'), 1, 16)
    || '-' || encode(gen_random_bytes(3), 'hex')
from profiles p
where not exists (select 1 from inbound_addresses ia where ia.user_id = p.id)
on conflict (local_part) do nothing;

-- ============================================================================
-- supabase/migrations/0004_push.sql
-- ============================================================================

-- Web push subscriptions.

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on push_subscriptions (user_id);

-- Tracks which reminders have already gone out, so a cron re-run cannot send
-- the same notification twice.
create table sent_reminders (
  user_id    uuid not null references profiles(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, event_id, kind)
);

alter table push_subscriptions enable row level security;
alter table sent_reminders     enable row level security;

create policy "own push subscriptions" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own reminders" on sent_reminders
  for select to authenticated using (user_id = auth.uid());

-- ============================================================================
-- supabase/migrations/0005_venue_setlistfm_id.sql
-- ============================================================================

-- Give venues a setlist.fm identity.
--
-- The setlist.fm importer creates venues that Ticketmaster has never heard of,
-- so they have no tm_id. Upserting those on `tm_id` does not work: Postgres
-- treats NULLs as distinct in a unique index, so every import inserted a fresh
-- duplicate row instead of matching the existing one.
--
-- setlist.fm gives each venue a stable id, so store it and conflict on that —
-- the same dual-identity pattern `events` already uses.

alter table venues add column if not exists setlistfm_id text;

create unique index if not exists venues_setlistfm_id_key
  on venues (setlistfm_id)
  where setlistfm_id is not null;

-- ============================================================================
-- supabase/migrations/0006_fix_inbound_search_path.sql
-- ============================================================================

-- Fixes a bug in 0003: assign_inbound_address() pinned search_path to `public`,
-- but Supabase installs pgcrypto into `extensions`, so gen_random_bytes() was
-- unresolvable. The trigger fires on every profile insert, so this broke every
-- signup with 42883, not just seeding.
--
-- 0003 has been corrected too; this migration exists for databases that already
-- applied the broken version. `create or replace` makes it a no-op otherwise.

create or replace function assign_inbound_address()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  base text;
  suffix text;
begin
  base := substr(regexp_replace(lower(new.handle), '[^a-z0-9]', '', 'g'), 1, 16);
  if base = '' then base := 'user'; end if;

  suffix := encode(gen_random_bytes(3), 'hex');

  insert into inbound_addresses (user_id, local_part)
  values (new.id, base || '-' || suffix)
  on conflict (local_part) do nothing;

  return new;
end;
$$;

-- ============================================================================
-- supabase/migrations/0007_lock_down_functions.sql
-- ============================================================================

-- Security hardening, from the Supabase database linter.
--
-- 1. handle_new_user() and assign_inbound_address() are trigger functions. They
--    were reachable at /rest/v1/rpc/<name> by anon and authenticated because
--    Postgres grants EXECUTE to PUBLIC by default. Triggers do not need any
--    EXECUTE grant to fire, so revoke it entirely.
--
-- 2. are_friends() is used inside an RLS policy, but as a SECURITY DEFINER
--    function it also let any caller ask whether two ARBITRARY users are
--    friends — a friendship-graph probe. Revoke public execute, and additionally
--    make the function refuse to answer about pairs the caller is not part of,
--    so it stays safe even if a grant is restored later.
--
--    Verified: the RLS policy on `attendances` still resolves correctly after
--    this, because it always passes auth.uid() as the first argument.
--
-- 3. touch_updated_at() had no pinned search_path.

revoke all on function public.handle_new_user()        from public, anon, authenticated;
revoke all on function public.assign_inbound_address()  from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid)   from public, anon;

create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Only answer about a pair the caller belongs to. The RLS policy always
    -- passes auth.uid() as `a`, so this is transparent there; a direct RPC
    -- probe of two other users now returns false instead of leaking.
    (auth.uid() is not distinct from a or auth.uid() is not distinct from b)
    and exists (
      select 1 from friendships
      where user_low  = least(a, b)
        and user_high = greatest(a, b)
        and status    = 'accepted'
    );
$$;

create or replace function touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================================
-- supabase/seed.sql
-- ============================================================================

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

insert into artists (id, tm_id, name, genres) values
  ('10000000-0000-4000-8000-000000000001', 'K8vZ917K7f7', 'Japanese Breakfast',   '{Rock,Indie}'),
  ('10000000-0000-4000-8000-000000000002', 'K8vZ9171Ck0', 'Turnstile',            '{Rock,Punk}'),
  ('10000000-0000-4000-8000-000000000003', 'K8vZ917pkPV', 'Fontaines D.C.',       '{Rock,Alternative}'),
  ('10000000-0000-4000-8000-000000000004', 'K8vZ9174sB7', 'Mitski',               '{Rock,Indie}'),
  ('10000000-0000-4000-8000-000000000005', 'K8vZ917oWOV', 'Alvvays',              '{Rock,Indie}'),
  ('10000000-0000-4000-8000-000000000006', 'K8vZ917bJ17', 'Big Thief',            '{Rock,Folk}'),
  ('10000000-0000-4000-8000-000000000007', 'K8vZ9171hJf', 'Wednesday',            '{Rock,Indie}'),
  ('10000000-0000-4000-8000-000000000008', 'K8vZ917_ru0', 'Slowdive',             '{Rock,Shoegaze}'),
  ('10000000-0000-4000-8000-000000000009', 'K8vZ9174e6f', 'Sunset Rollercoaster', '{Rock,Indie}')
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

insert into event_artists (event_id, artist_id, billing)
select id, headliner_id, 'headliner' from events where headliner_id is not null
on conflict (event_id, artist_id) do nothing;

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
    (u_you, e_alvvays,   'went',  'friends', 'manual',    null,           null,  null, null)
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
