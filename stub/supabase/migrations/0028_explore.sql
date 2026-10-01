-- Explore: upcoming shows by artists the household cares about.
--
-- "Cares about" is two things:
--   * follow: anyone in the household follows them (user_artists: Spotify
--     favourites and manual follows).
--   * seen:   they headline, or are on the lineup of, a show already on the
--     household's list. 'went' when that show is marked went OR is in the past:
--     most past shows are still 'going', because nothing flips them.
--     'ticket' when every such show is still ahead.
--
-- explore_events() returns the matching upcoming events that are NOT already on
-- the household's list, one row per event with the artist that put it there.
-- It is SECURITY DEFINER because user_artists is readable only by its owner
-- ("own artists" in 0002), and Explore has to see the other member's follows
-- too. It takes no household argument: the scope is current_household_id(), so
-- a caller can only ever ask about their own household.

-- When the Explore refresh last asked Ticketmaster about this artist, hit or
-- miss, so a daily run re-checks each artist every few days instead of every
-- artist every day.
alter table artists add column if not exists tm_checked_at timestamptz;

create or replace function explore_events(horizon_days int default 365)
returns table (event_id uuid, artist_id uuid, reason text)
language sql
stable
security definer
set search_path = public
as $$
  with hh as (
    select current_household_id() as id
  ),
  followed as (
    select distinct ua.artist_id
    from user_artists ua
    join household_members m on m.user_id = ua.user_id
    where m.household_id = (select id from hh)
  ),
  seen as (
    select e.headliner_id as artist_id, bool_or(a.state = 'went' or e.starts_at < now()) as went
    from attendances a
    join events e on e.id = a.event_id
    where a.household_id = (select id from hh) and e.headliner_id is not null
    group by 1
    union all
    select ea.artist_id, bool_or(a.state = 'went' or e.starts_at < now())
    from attendances a
    join event_artists ea on ea.event_id = a.event_id
    join events e on e.id = a.event_id
    where a.household_id = (select id from hh)
    group by 1
  ),
  interest as (
    select artist_id, 'follow'::text as reason from followed
    union all
    select artist_id, case when bool_or(went) then 'went' else 'ticket' end
    from seen
    where artist_id not in (select artist_id from followed)
    group by artist_id
  ),
  candidate as (
    select e.id as event_id, i.artist_id, i.reason, true as headlining
    from events e join interest i on i.artist_id = e.headliner_id
    union all
    select ea.event_id, i.artist_id, i.reason, false
    from event_artists ea join interest i on i.artist_id = ea.artist_id
  )
  select distinct on (c.event_id) c.event_id, c.artist_id, c.reason
  from candidate c
  join events e on e.id = c.event_id
  where e.starts_at > now()
    and e.starts_at < now() + make_interval(days => horizon_days)
    and e.status !~* 'cancel'
    and not exists (
      select 1 from attendances a
      where a.event_id = c.event_id and a.household_id = (select id from hh)
    )
  -- Per event, the strongest reason: a follow beats a past show, a headliner
  -- beats a lineup slot.
  order by c.event_id, (c.reason = 'follow') desc, c.headlining desc;
$$;

revoke all on function public.explore_events(int) from public, anon;
grant execute on function public.explore_events(int) to authenticated;

-- The artists Explore keeps fresh: the same interest set, across every
-- household. Service role only; the refresh job calls it.
create or replace function explore_artists()
returns table (artist_id uuid, name text, tm_id text, tm_checked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.name, a.tm_id, a.tm_checked_at
  from artists a
  where a.id in (
    select artist_id from user_artists
    union
    select e.headliner_id from attendances t join events e on e.id = t.event_id
    union
    select ea.artist_id from attendances t join event_artists ea on ea.event_id = t.event_id
  );
$$;

revoke all on function public.explore_artists() from public, anon, authenticated;
grant execute on function public.explore_artists() to service_role;
