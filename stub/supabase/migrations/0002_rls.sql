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
