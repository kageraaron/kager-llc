-- Invites (friend and event) plus a liveness heartbeat.
--
-- Three unrelated-looking things in one migration because they are all small
-- and all landed together; splitting them would just be three files to apply.

-- ============================================================ friend invites
--
-- Adding a friend currently requires knowing their handle, which means the
-- handle has to travel out of band before anyone can connect. An invite link
-- carries the identity itself: the recipient opens it, signs in, and the
-- friendship is created without either side typing anything.
--
-- The token IS the credential, so it is random, revocable, and expiring. It is
-- deliberately reusable up to `max_uses` — one link pasted into a group chat is
-- the case this exists for.

create table friend_invites (
  token       text primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  max_uses    integer not null default 25 check (max_uses > 0),
  uses        integer not null default 0 check (uses >= 0),
  revoked_at  timestamptz
);

create index friend_invites_user on friend_invites (user_id);

alter table friend_invites enable row level security;

-- Owners manage their own links. REDEEMING one is not covered by any policy
-- here: the redeemer cannot see the row (they only hold the token), so that
-- path goes through the service role in a server action, which is also what
-- lets it check expiry and use count in one place.
create policy "own invites readable" on friend_invites
  for select to authenticated using (user_id = auth.uid());

create policy "create own invites" on friend_invites
  for insert to authenticated with check (user_id = auth.uid());

create policy "revoke own invites" on friend_invites
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "delete own invites" on friend_invites
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================ event invites
--
-- "You should come to this" — one friend pointing another at a specific show.
--
-- Distinct from an attendance: the recipient has not said yes to anything yet.
-- Accepting creates the attendance and closes the invite; declining just closes
-- it. Unique on (event, sender, recipient) so re-sending is idempotent rather
-- than filling the recipient's list with duplicates.

create type event_invite_state as enum ('pending', 'accepted', 'declined');

create table event_invites (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id   uuid not null references profiles(id) on delete cascade,
  message      text not null default '' check (char_length(message) <= 280),
  state        event_invite_state not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint event_invites_not_self check (from_user_id <> to_user_id),
  unique (event_id, from_user_id, to_user_id)
);

create index event_invites_to_user on event_invites (to_user_id, state);
create index event_invites_from_user on event_invites (from_user_id);

alter table event_invites enable row level security;

-- Both parties can see the invite; nobody else can.
create policy "see own event invites" on event_invites
  for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- You may only send as yourself, and only to an accepted friend. Without the
-- friendship check this is an open channel for a stranger to put text in
-- someone's inbox.
create policy "send event invites" on event_invites
  for insert to authenticated
  with check (
    from_user_id = auth.uid()
    and are_friends(auth.uid(), to_user_id)
  );

-- The recipient responds; the sender may retract by deleting.
create policy "respond to event invites" on event_invites
  for update to authenticated
  using (to_user_id = auth.uid()) with check (to_user_id = auth.uid());

create policy "retract event invites" on event_invites
  for delete to authenticated using (from_user_id = auth.uid());

-- ============================================================ heartbeat
--
-- Supabase pauses a free project after ~7 days with no activity, and the first
-- person back then hits a dead app. A scheduled write keeps it awake.
--
-- A WRITE rather than a read, deliberately: it is unambiguous activity, and the
-- row's timestamp doubles as a record of when the keep-alive last actually ran,
-- which is the thing you want to check when the project paused anyway.
--
-- Single row, upserted by the service role. No RLS policies at all, so the
-- table is invisible to every client — nothing outside the cron touches it.

create table service_heartbeat (
  id         text primary key,
  beat_at    timestamptz not null default now(),
  note       text not null default ''
);

alter table service_heartbeat enable row level security;

insert into service_heartbeat (id, note) values ('keepalive', 'bootstrap')
  on conflict (id) do nothing;
