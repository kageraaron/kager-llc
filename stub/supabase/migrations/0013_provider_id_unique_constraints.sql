-- Provider id columns need unique CONSTRAINTS, not partial unique indexes.
--
-- `0010` (JamBase) and `0012` (Spotify) both created
--
--   create unique index ... on events (jambase_id) where jambase_id is not null;
--
-- reasoning that most rows carry only one provider's id. That is true, and the
-- index does enforce uniqueness — but it does not support the upsert.
--
-- PostgREST's `onConflict: 'jambase_id'` emits `ON CONFLICT (jambase_id)`.
-- Postgres will only use a PARTIAL index for that if the statement repeats the
-- index predicate (`ON CONFLICT (jambase_id) WHERE jambase_id is not null`),
-- which PostgREST never emits. So every one of those upserts failed with
--
--   there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- `upsertJamBaseEvent`, `upsertJbArtist` and `upsertJbVenue` all take this
-- path, which means adding a JamBase event from Browse has never worked. It
-- went unnoticed because the failure is caught and logged, and Browse just says
-- "Could not save that event".
--
-- A plain UNIQUE constraint is the right tool and always was: Postgres treats
-- NULLs as distinct, so a nullable column can be UNIQUE and still have any
-- number of rows without an id. That is exactly what `0001` does for `tm_id`,
-- `mbid` and `setlistfm_id`, which is why those upserts work.

drop index if exists events_jambase_id_key;
drop index if exists venues_jambase_id_key;
drop index if exists artists_jambase_id_key;
drop index if exists events_spotify_concert_id_key;
drop index if exists venues_spotify_venue_id_key;
drop index if exists artists_spotify_venue_id_key;
drop index if exists artists_spotify_artist_id_key;

do $$
begin
  -- Guarded individually so a partially-applied run is safe to repeat.
  if not exists (select 1 from pg_constraint where conname = 'events_jambase_id_uniq') then
    alter table events add constraint events_jambase_id_uniq unique (jambase_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_jambase_id_uniq') then
    alter table venues add constraint venues_jambase_id_uniq unique (jambase_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'artists_jambase_id_uniq') then
    alter table artists add constraint artists_jambase_id_uniq unique (jambase_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'events_spotify_concert_id_uniq') then
    alter table events add constraint events_spotify_concert_id_uniq unique (spotify_concert_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_spotify_venue_id_uniq') then
    alter table venues add constraint venues_spotify_venue_id_uniq unique (spotify_venue_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'artists_spotify_artist_id_uniq') then
    alter table artists add constraint artists_spotify_artist_id_uniq unique (spotify_artist_id);
  end if;
end $$;
