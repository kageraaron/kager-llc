-- Give venues a setlist.fm identity.
--
-- The setlist.fm importer creates venues that Ticketmaster has never heard of,
-- so they have no tm_id. Upserting those on `tm_id` does not work: Postgres
-- treats NULLs as distinct in a unique index, so every import inserted a fresh
-- duplicate row instead of matching the existing one.
--
-- setlist.fm gives each venue a stable id, so store it and conflict on that —
-- the same dual-identity pattern `events` already uses.

alter table venues add column if not exists setlistfm_id text;

create unique index if not exists venues_setlistfm_id_key
  on venues (setlistfm_id)
  where setlistfm_id is not null;
