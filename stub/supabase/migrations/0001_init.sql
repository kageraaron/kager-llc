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
