-- TRMNL e-ink display feed.
--
-- TRMNL private plugins using the "Polling" strategy have TRMNL's servers fetch
-- a URL on the user's behalf, on the playlist's refresh schedule. Nothing in
-- that request carries a Stub session — same constraint the calendar feed hit in
-- 0008 — so the URL itself is again the credential.
--
-- This is a SEPARATE token from `calendar_token` on purpose. They are handed to
-- different third parties and revoked for different reasons: rotating a calendar
-- link that got pasted into a shared Google Calendar should not also blank the
-- display on the wall, and vice versa. One column per audience keeps each
-- rotation's blast radius to the thing the user actually meant to revoke.

alter table profiles add column if not exists trmnl_token text unique;

create or replace function assign_trmnl_token()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.trmnl_token is null then
    new.trmnl_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

revoke all on function public.assign_trmnl_token() from public, anon, authenticated;

create trigger on_profile_assign_trmnl_token
  before insert on profiles
  for each row execute function assign_trmnl_token();

update profiles
   set trmnl_token = encode(extensions.gen_random_bytes(24), 'hex')
 where trmnl_token is null;

alter table profiles alter column trmnl_token set not null;

-- No grant for the new column. 0008 revoked `all on profiles from authenticated`
-- and re-granted an explicit column list; because these grants are column-level,
-- a column added later is unreadable by the browser client until it is named in
-- a grant, which this one deliberately never is. Like `calendar_token`, it is
-- surfaced to its owner only through a server action.
