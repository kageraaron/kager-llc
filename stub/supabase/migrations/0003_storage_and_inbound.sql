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
