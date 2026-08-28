-- Subscribable calendar feed.
--
-- Calendar clients (Apple Calendar, Google Calendar) cannot carry a session, so
-- the feed URL itself has to be the credential. The token is random, per-user,
-- and rotatable; it grants read-only access to that user's going/interested
-- events and nothing else. Notes are never included.

alter table profiles add column if not exists calendar_token text unique;

create or replace function assign_calendar_token()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.calendar_token is null then
    new.calendar_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

revoke all on function public.assign_calendar_token() from public, anon, authenticated;

create trigger on_profile_assign_calendar_token
  before insert on profiles
  for each row execute function assign_calendar_token();

update profiles
   set calendar_token = encode(extensions.gen_random_bytes(24), 'hex')
 where calendar_token is null;

alter table profiles alter column calendar_token set not null;

-- The token is a bearer credential, so keep it out of the columns the browser
-- client can select. It is surfaced to its owner through a server action.
revoke all on profiles from authenticated;
grant select (id, handle, display_name, bio, avatar_url, home_city, created_at, updated_at)
  on profiles to authenticated;
grant update (handle, display_name, bio, avatar_url, home_city)
  on profiles to authenticated;
