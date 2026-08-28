-- JamBase identifiers on the catalog tables.
--
-- JamBase aggregates ~60 sources and, unlike Ticketmaster, sees festival
-- lineups and the club circuit. Events can therefore arrive from either
-- provider, so each catalog row carries whichever ids it has and we upsert on
-- the one we know. Partial unique indexes, because most rows have only one.

alter table events  add column if not exists jambase_id text;
alter table venues  add column if not exists jambase_id text;
alter table artists add column if not exists jambase_id text;

create unique index if not exists events_jambase_id_key
  on events (jambase_id) where jambase_id is not null;
create unique index if not exists venues_jambase_id_key
  on venues (jambase_id) where jambase_id is not null;
create unique index if not exists artists_jambase_id_key
  on artists (jambase_id) where jambase_id is not null;

-- Festivals span days and behave differently in the UI (no single start time,
-- a lineup rather than a headliner).
alter table events add column if not exists is_festival boolean not null default false;
alter table events add column if not exists ends_at timestamptz;
