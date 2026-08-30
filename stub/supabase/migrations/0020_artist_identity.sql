-- Canonical artist identity, resolved once from MusicBrainz.
--
-- Every provider here resolves an artist by FUZZY NAME SEARCH, independently.
-- That is how "Chris Stussy" comes back as "CHRIS STASSY" from one service and
-- unchanged from another, and why attaching artwork by name carries a real risk
-- of putting a stranger's face on someone's memory.
--
-- MusicBrainz has the artist's actual accounts on each platform, curated by
-- humans and free to query. Resolving once and storing the ids turns every
-- subsequent lookup from a guess into an exact fetch.

alter table artists add column if not exists deezer_artist_id text;

-- The full relation set, for the "where to listen" links on an artist. Kept as
-- jsonb rather than a column per platform because the useful set keeps growing
-- (Bandcamp, SoundCloud, Resident Advisor, Beatport, Tidal…) and none of it is
-- ever queried by value — it is read whole, for one artist, to render links.
alter table artists add column if not exists links jsonb;

/*
 * When identity resolution last RAN, as opposed to last succeeded.
 *
 * Without this the backfill cron cannot tell "no MusicBrainz entry exists" from
 * "not looked at yet", so it would re-query the same unresolvable artists on
 * every run forever — and MusicBrainz allows one request per second, so that
 * ceiling matters. Set on every attempt, successful or not.
 */
alter table artists add column if not exists identity_checked_at timestamptz;

create index if not exists artists_identity_unchecked
  on artists (identity_checked_at nulls first);

create unique index if not exists artists_deezer_artist_id_key
  on artists (deezer_artist_id) where deezer_artist_id is not null;
