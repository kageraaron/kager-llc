-- Provider response caches.
--
-- Two different shapes, because the data has two different lifetimes.

-- ============================================================ setlists
--
-- A past show's setlist never changes once it exists, so a hit is cached
-- forever. A MISS is cached too, with a short TTL: setlist.fm entries are added
-- by users days or weeks after a show, and without negative caching every view
-- of an archived event re-hits an API that returns 403 when rate limited.

create table if not exists event_setlists (
  event_id    uuid primary key references events(id) on delete cascade,
  found       boolean not null,
  payload     jsonb,
  setlistfm_url text,
  song_count  integer not null default 0,
  fetched_at  timestamptz not null default now(),
  -- Null for hits (never expires). Set for misses, so we retry later.
  recheck_after timestamptz
);

create index if not exists event_setlists_recheck
  on event_setlists (recheck_after) where recheck_after is not null;

alter table event_setlists enable row level security;

-- Setlists are public facts about public shows; any signed-in user may read
-- them. Writes go through the service role.
create policy "setlists readable" on event_setlists
  for select to authenticated using (true);

-- ============================================================ search
--
-- Short-lived, keyed on the normalised query. "What's on near me" is highly
-- repeatable across users in the same city, and JamBase is a metered trial.

create table if not exists search_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists search_cache_expiry on search_cache (expires_at);

alter table search_cache enable row level security;
-- No policy: this table is service-role only. Callers reach it through the
-- search route, never directly from the browser.
