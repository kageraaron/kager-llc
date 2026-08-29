-- Spotify identifiers on the catalog tables.
--
-- A third provider can describe the same show, so each catalog row carries
-- whichever ids it has and we upsert on the one we know. Partial unique
-- indexes, because most rows have only one. Mirrors `0010` for JamBase.
--
-- Note this is the *concert graph* read through the RapidAPI proxy, not the
-- OAuth Spotify integration in `providers/spotify.ts`.

alter table events  add column if not exists spotify_concert_id text;
alter table venues  add column if not exists spotify_venue_id   text;
alter table artists add column if not exists spotify_artist_id  text;

create unique index if not exists events_spotify_concert_id_key
  on events (spotify_concert_id) where spotify_concert_id is not null;
create unique index if not exists venues_spotify_venue_id_key
  on venues (spotify_venue_id) where spotify_venue_id is not null;
create unique index if not exists artists_spotify_artist_id_key
  on artists (spotify_artist_id) where spotify_artist_id is not null;
