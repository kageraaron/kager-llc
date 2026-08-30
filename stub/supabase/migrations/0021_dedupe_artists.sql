-- Merge duplicate artist rows created by a runaway lookup bug.
--
-- ## What happened
--
-- The name-fallback path in `upsertSpotifyArtist` looked up an existing artist
-- with `.ilike('name', name).maybeSingle()`. `maybeSingle()` ERRORS when more
-- than one row matches, and the caller discarded the error — so the moment two
-- rows shared a name the lookup returned nothing and the code inserted a third.
-- Then a fourth. In production this reached six rows for "Silva Bumpa" and four
-- apiece for dozens of others, all with identical names and no provider id.
--
-- The code fix is `.limit(1)` before `.maybeSingle()`. This migration cleans up
-- what the bug already wrote.
--
-- ## How the winner is chosen
--
-- Most informative row wins, in this order:
--   1. has a provider id (tm/jambase/spotify/bandsintown) — it is reachable
--      from a provider sync and must keep its id
--   2. has an image
--   3. has an mbid
--   4. oldest, as a stable tie-break
--
-- Grouping is on the name with case and punctuation stripped, so "Tegan & Sara"
-- and "Tegan and Sara" merge too.

-- Extra columns are folded onto the winner where the winner lacks them, so a
-- merge never loses an image or an id that only a loser had.

-- A session-scoped temp table rather than `on commit drop`: the migration
-- runner does not guarantee that every statement shares one transaction, and an
-- `on commit drop` table would vanish after the CREATE if it does not.
create temporary table artist_merge as
with keyed as (
  select
    id,
    name,
    created_at,
    regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as key,
    (tm_id is not null or jambase_id is not null
       or spotify_artist_id is not null or bandsintown_id is not null) as has_provider_id,
    (image_url is not null) as has_image,
    (mbid is not null) as has_mbid
  from artists
  where regexp_replace(lower(name), '[^a-z0-9]', '', 'g') <> ''
),
ranked as (
  select id, key,
         row_number() over (
           partition by key
           order by has_provider_id desc, has_image desc, has_mbid desc, created_at asc, id asc
         ) as rn
  from keyed
)
select r.id as loser_id, w.id as winner_id
from ranked r
join ranked w on w.key = r.key and w.rn = 1
where r.rn > 1;

-- ---- Fold missing detail from losers onto the winner, before repointing.

update artists a
set image_url = coalesce(a.image_url, l.image_url)
from artist_merge m
join artists l on l.id = m.loser_id
where a.id = m.winner_id and a.image_url is null and l.image_url is not null;

update artists a
set mbid = l.mbid
from artist_merge m
join artists l on l.id = m.loser_id
where a.id = m.winner_id and a.mbid is null and l.mbid is not null
  -- `mbid` is unique; only take it if no other artist already holds it.
  and not exists (select 1 from artists x where x.mbid = l.mbid and x.id <> l.id);

update artists a
set genres = l.genres
from artist_merge m
join artists l on l.id = m.loser_id
where a.id = m.winner_id and a.genres = '{}' and l.genres <> '{}';

-- ---- Repoint every reference.

update events e
set headliner_id = m.winner_id
from artist_merge m
where e.headliner_id = m.loser_id;

/*
 * `event_artists` and `user_artists` have composite primary keys including
 * artist_id, so a naive repoint collides.
 *
 * Deleting the colliding losers first and then updating is NOT enough, and prod
 * proved it: when TWO losers map to the same winner, the first update creates
 * the winner row and the second then collides with it — a row that did not
 * exist when the delete ran.
 *
 * So: INSERT the desired winner rows (ignoring conflicts), then delete every
 * loser row outright. No update, nothing to collide, and idempotent.
 *
 * `distinct on` is required because several losers can produce the same winner
 * row within a single INSERT, which `on conflict` does not resolve
 * intra-statement.
 */
insert into event_artists (event_id, artist_id, billing)
select distinct on (ea.event_id, m.winner_id)
       ea.event_id, m.winner_id, ea.billing
from event_artists ea
join artist_merge m on ea.artist_id = m.loser_id
order by ea.event_id, m.winner_id, (ea.billing = 'headliner') desc
on conflict (event_id, artist_id) do nothing;

delete from event_artists ea using artist_merge m where ea.artist_id = m.loser_id;

insert into user_artists (user_id, artist_id, source, weight)
select distinct on (ua.user_id, m.winner_id, ua.source)
       ua.user_id, m.winner_id, ua.source, ua.weight
from user_artists ua
join artist_merge m on ua.artist_id = m.loser_id
order by ua.user_id, m.winner_id, ua.source, ua.weight desc
on conflict (user_id, artist_id, source) do nothing;

delete from user_artists ua using artist_merge m where ua.artist_id = m.loser_id;

-- ---- Remove the losers. Anything still referencing them would fail here,
-- ---- which is the outcome we want: better a failed migration than an orphan.

delete from artists a using artist_merge m where a.id = m.loser_id;

drop table artist_merge;
