-- Eventbrite event ids on the shared catalog.
--
-- Eventbrite is the first provider here that is FIRST-PARTY to the ticket: when
-- a confirmation carries an Eventbrite link, the id in it identifies the exact
-- event, and Eventbrite's own API answers with the authoritative name, venue
-- and — the field that motivated this — a real IANA timezone.
--
-- Partial unique index rather than a plain `unique`, matching the pattern in
-- `0013`: most events have no Eventbrite id, and a plain unique constraint over
-- a nullable column behaves differently across engines. This one indexes only
-- the rows that actually carry an id.

alter table events add column if not exists eventbrite_id text;

create unique index if not exists events_eventbrite_id_key
  on events (eventbrite_id) where eventbrite_id is not null;

-- Eventbrite has no performer entity — it sells tickets to events, not to
-- artists — so rows written from it have a null `headliner_id` and no
-- `event_artists`. Nothing to add for that; noted so the absence reads as
-- deliberate rather than as a gap.
