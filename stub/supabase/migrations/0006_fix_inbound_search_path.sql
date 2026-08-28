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
