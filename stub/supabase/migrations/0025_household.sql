-- Households replace friends.
--
-- Stub is now a household app (two adults sharing everything), modelled on Sure's
-- "family": everyone in a household is an admin and sees the same things.
--
--   * Shows (attendances) belong to the HOUSEHOLD. There is no per-person
--     "who is going" any more: a show is on the household's list or it is not.
--     `attendances.user_id` survives only as "added by", and is nulled rather
--     than cascaded when that person's account goes away.
--   * Notes are shared, one per show per household.
--   * The review Inbox is shared: both people's Gmail feeds one queue, and a
--     confirmation that reached both inboxes produces one card, not two.
--   * Gmail connections stay personal (a token belongs to one Google account),
--     but both members can see and disconnect either.
--   * Friends are gone: friendships, friend invites, event invites, the
--     are_friends() probe and attendance visibility are all dropped.
--
-- The one mechanism that makes the existing write paths keep working is
-- `set_household_id()`: a BEFORE INSERT trigger that fills `household_id` from
-- the row's `user_id`. Code that inserts "as a person" lands in that person's
-- household without having to know about households at all, and ON CONFLICT
-- (household_id, ...) still arbitrates correctly because BEFORE triggers run
-- ahead of the conflict check.
--
-- Joining: every user starts in a household of their own (created at signup,
-- and for existing users right here). An admin mints an invite link; redeeming
-- it merges the redeemer's household INTO the inviter's via merge_household(),
-- folding duplicate shows, notes and messages together rather than refusing.

-- ============================================================ households

create table households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Home' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

-- One household per person. Everyone is an admin; the column exists so a
-- future "member" role is a data change, not a migration.
create table household_members (
  user_id      uuid primary key references profiles(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  role         text not null default 'admin' check (role in ('admin')),
  joined_at    timestamptz not null default now()
);

create index household_members_household on household_members (household_id);

create table household_invites (
  token        text primary key,
  household_id uuid not null references households(id) on delete cascade,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  used_by      uuid references profiles(id) on delete set null,
  used_at      timestamptz
);

create index household_invites_household on household_invites (household_id);

-- The caller's household. SECURITY DEFINER so RLS policies can call it without
-- recursing through household_members' own policy.
create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid();
$$;

revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated;

-- ============================================================ existing users

-- A household of one for everyone who already exists.
do $$
declare
  p record;
  h uuid;
begin
  for p in select id, display_name from profiles where id not in (select user_id from household_members) loop
    insert into households (name) values ('Home') returning id into h;
    insert into household_members (user_id, household_id) values (p.id, h);
  end loop;
end $$;

-- New signups get one too. Extends handle_new_user() rather than adding a
-- second trigger, so profile-then-household ordering is guaranteed.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  h uuid;
begin
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    substr(
      lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9_]', '', 'g')),
      1, 15
    ) || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.households (name) values ('Home') returning id into h;
  insert into public.household_members (user_id, household_id) values (new.id, h);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================ drop friends

drop policy if exists "friends attendances" on attendances;
drop table if exists event_invites;
drop table if exists friend_invites;
drop table if exists friendships;
drop function if exists are_friends(uuid, uuid);
drop type if exists friendship_status;

alter table attendances drop column if exists visibility;
drop type if exists attendance_visibility;

-- ============================================================ household columns

alter table attendances       add column household_id uuid references households(id) on delete cascade;
alter table notes             add column household_id uuid references households(id) on delete cascade;
alter table ingest_messages   add column household_id uuid references households(id) on delete cascade;
alter table ingest_candidates add column household_id uuid references households(id) on delete cascade;

update attendances       t set household_id = m.household_id from household_members m where m.user_id = t.user_id;
update notes             t set household_id = m.household_id from household_members m where m.user_id = t.user_id;
update ingest_messages   t set household_id = m.household_id from household_members m where m.user_id = t.user_id;
update ingest_candidates t set household_id = m.household_id from household_members m where m.user_id = t.user_id;

alter table attendances       alter column household_id set not null;
alter table notes             alter column household_id set not null;
alter table ingest_messages   alter column household_id set not null;
alter table ingest_candidates alter column household_id set not null;

-- Fill household_id from user_id on insert, so every existing write path keeps
-- working. A caller that supplies household_id explicitly wins.
create or replace function set_household_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.household_id is null and new.user_id is not null then
    select household_id into new.household_id from household_members where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_household_id() from public, anon, authenticated;

create trigger attendances_household       before insert on attendances       for each row execute function set_household_id();
create trigger notes_household             before insert on notes             for each row execute function set_household_id();
create trigger ingest_messages_household   before insert on ingest_messages   for each row execute function set_household_id();
create trigger ingest_candidates_household before insert on ingest_candidates for each row execute function set_household_id();

-- "Added by" for shared rows: keep the row when its author's account goes.
alter table attendances alter column user_id drop not null;
alter table notes       alter column user_id drop not null;
alter table attendances drop constraint attendances_user_id_fkey,
  add constraint attendances_user_id_fkey foreign key (user_id) references profiles(id) on delete set null;
alter table notes drop constraint notes_user_id_fkey,
  add constraint notes_user_id_fkey foreign key (user_id) references profiles(id) on delete set null;

-- Uniqueness moves from the person to the household.
alter table attendances     drop constraint if exists attendances_user_id_event_id_key;
alter table notes           drop constraint if exists notes_user_id_event_id_key;
alter table ingest_messages drop constraint if exists ingest_messages_user_id_content_hash_key;

alter table attendances     add constraint attendances_household_event_key unique (household_id, event_id);
alter table notes           add constraint notes_household_event_key       unique (household_id, event_id);
alter table ingest_messages add constraint ingest_messages_household_hash_key unique (household_id, content_hash);

drop index if exists attendances_user;
drop index if exists attendances_rated;
drop index if exists ingest_candidates_user_state;
drop index if exists ingest_candidates_dedupe;
drop index if exists ingest_messages_rescan;

create index attendances_household       on attendances (household_id);
create index attendances_household_rated on attendances (household_id, rating) where rating is not null;
create index ingest_candidates_household_state  on ingest_candidates (household_id, state);
create index ingest_candidates_household_dedupe on ingest_candidates (household_id, dedupe_key)
  where dedupe_key is not null;
create index ingest_messages_household_rescan   on ingest_messages (household_id, extractor_version);

-- ============================================================ merging

-- Fold household `src` into `dst`: members, shows, notes, inbox. Duplicates are
-- merged, never refused — two people who both logged the same gig end up with
-- one show carrying whatever each of them knew.
create or replace function merge_household(src uuid, dst uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if src = dst then return; end if;

  -- Shows both households have: copy over anything dst is missing, then drop src's.
  update attendances d set
    ticket_ref      = coalesce(d.ticket_ref, s.ticket_ref),
    seat_info       = coalesce(d.seat_info, s.seat_info),
    price_cents     = coalesce(d.price_cents, s.price_cents),
    ticket_quantity = coalesce(d.ticket_quantity, s.ticket_quantity),
    purchased_at    = coalesce(d.purchased_at, s.purchased_at),
    rating          = coalesce(d.rating, s.rating),
    review          = coalesce(d.review, s.review),
    rated_at        = coalesce(d.rated_at, s.rated_at)
  from attendances s
  where s.household_id = src and d.household_id = dst and d.event_id = s.event_id;
  delete from attendances s
  using attendances d
  where s.household_id = src and d.household_id = dst and d.event_id = s.event_id;
  update attendances set household_id = dst where household_id = src;

  -- Notes on the same show: keep both texts.
  update notes d set body = d.body || E'\n\n' || s.body
  from notes s
  where s.household_id = src and d.household_id = dst and d.event_id = s.event_id
    and s.body <> '' and s.body <> d.body;
  delete from notes s
  using notes d
  where s.household_id = src and d.household_id = dst and d.event_id = s.event_id;
  update notes set household_id = dst where household_id = src;

  -- The same email in both inboxes: keep dst's copy (its candidates cascade away with src's).
  delete from ingest_messages s
  using ingest_messages d
  where s.household_id = src and d.household_id = dst and d.content_hash = s.content_hash;
  update ingest_messages   set household_id = dst where household_id = src;
  update ingest_candidates set household_id = dst where household_id = src;

  update household_members set household_id = dst where household_id = src;
  delete from households where id = src;
end;
$$;

revoke all on function public.merge_household(uuid, uuid) from public, anon, authenticated;

-- Redeem an invite as the signed-in user. Everything is checked here, in one
-- transaction, because the redeemer cannot see the invite row through RLS.
create or replace function redeem_household_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv  household_invites%rowtype;
  mine uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into inv from household_invites where token = invite_token for update;
  if not found then raise exception 'invite not found'; end if;
  if inv.used_at is not null then raise exception 'invite already used'; end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;

  select household_id into mine from household_members where user_id = auth.uid();
  if mine = inv.household_id then return mine; end if;

  perform merge_household(mine, inv.household_id);
  update household_invites set used_by = auth.uid(), used_at = now() where token = invite_token;
  return inv.household_id;
end;
$$;

revoke all on function public.redeem_household_invite(text) from public, anon;
grant execute on function public.redeem_household_invite(text) to authenticated;

-- ============================================================ row level security

alter table households        enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;

create policy "own household" on households
  for select to authenticated using (id = current_household_id());
create policy "rename own household" on households
  for update to authenticated using (id = current_household_id()) with check (id = current_household_id());

create policy "household members" on household_members
  for select to authenticated using (household_id = current_household_id());

create policy "household invites" on household_invites
  for select to authenticated using (household_id = current_household_id());
create policy "create household invites" on household_invites
  for insert to authenticated
  with check (household_id = current_household_id() and created_by = auth.uid());
create policy "revoke household invites" on household_invites
  for delete to authenticated using (household_id = current_household_id());

grant select, update (name) on households to authenticated;
grant select on household_members to authenticated;
grant select, insert, delete on household_invites to authenticated;

-- Profiles: only your own household, now that nobody looks people up by handle.
drop policy if exists "profiles readable" on profiles;
create policy "household profiles readable" on profiles
  for select to authenticated
  using (id = auth.uid() or id in (select user_id from household_members where household_id = current_household_id()));

-- Shows
drop policy if exists "own attendances"        on attendances;
drop policy if exists "write own attendances"  on attendances;
drop policy if exists "update own attendances" on attendances;
drop policy if exists "delete own attendances" on attendances;

create policy "household attendances" on attendances
  for select to authenticated using (household_id = current_household_id());
create policy "add household attendances" on attendances
  for insert to authenticated
  with check (user_id = auth.uid() and coalesce(household_id, current_household_id()) = current_household_id());
create policy "update household attendances" on attendances
  for update to authenticated
  using (household_id = current_household_id()) with check (household_id = current_household_id());
create policy "delete household attendances" on attendances
  for delete to authenticated using (household_id = current_household_id());

-- Notes: shared inside the household.
drop policy if exists "notes are private" on notes;
create policy "household notes" on notes
  for all to authenticated
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- Gmail connections: visible and disconnectable by either member. Tokens stay
-- unselectable (column grants from 0002 are untouched).
drop policy if exists "own email accounts"        on email_accounts;
drop policy if exists "delete own email accounts" on email_accounts;
create policy "household email accounts" on email_accounts
  for select to authenticated
  using (user_id in (select user_id from household_members where household_id = current_household_id()));
create policy "disconnect household email accounts" on email_accounts
  for delete to authenticated
  using (user_id in (select user_id from household_members where household_id = current_household_id()));

-- The shared Inbox
drop policy if exists "own ingest messages"    on ingest_messages;
drop policy if exists "own ingest candidates"  on ingest_candidates;
drop policy if exists "resolve own candidates" on ingest_candidates;

create policy "household ingest messages" on ingest_messages
  for select to authenticated using (household_id = current_household_id());
create policy "household ingest candidates" on ingest_candidates
  for select to authenticated using (household_id = current_household_id());
create policy "resolve household candidates" on ingest_candidates
  for update to authenticated
  using (household_id = current_household_id()) with check (household_id = current_household_id());

grant select (id, user_id, household_id, from_addr, subject, received_at, extractor, status, error, created_at)
  on ingest_messages to authenticated;

-- An emptied household (its last member deleted their account) goes too.
create or replace function drop_empty_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from households h
  where h.id = old.household_id
    and not exists (select 1 from household_members m where m.household_id = h.id);
  return old;
end;
$$;

revoke all on function public.drop_empty_household() from public, anon, authenticated;

create trigger household_members_cleanup
  after delete on household_members
  for each row execute function drop_empty_household();
