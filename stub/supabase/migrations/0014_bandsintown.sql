-- Bandsintown (via Parse) — identifiers, plus a real credit ledger.
--
-- ============================================================ identifiers
--
-- Fourth provider that can describe the same show. Same pattern as `0010`
-- (JamBase) and `0012` (Spotify), but using UNIQUE CONSTRAINTS rather than
-- partial unique indexes — see `0013` for why the indexes silently broke every
-- upsert that used them. Postgres treats NULLs as distinct, so a nullable
-- column can be UNIQUE and still have any number of rows without an id.

alter table events  add column if not exists bandsintown_id text;
alter table artists add column if not exists bandsintown_id text;
alter table venues  add column if not exists bandsintown_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_bandsintown_id_uniq') then
    alter table events add constraint events_bandsintown_id_uniq unique (bandsintown_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'artists_bandsintown_id_uniq') then
    alter table artists add constraint artists_bandsintown_id_uniq unique (bandsintown_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_bandsintown_id_uniq') then
    alter table venues add constraint venues_bandsintown_id_uniq unique (bandsintown_id);
  end if;
end $$;

-- ============================================================ credit ledger
--
-- Every other provider here is metered in requests per day or per month, and
-- the cost of overrunning is a 429 we can back off from. Bandsintown is metered
-- in CREDITS off a small prepaid balance (~200 at the time of writing, with a
-- 99/day cap), and overrunning it does not throttle us — it empties the
-- account. The response header tells us the remaining balance only AFTER we
-- have already spent, which is too late to be a control.
--
-- So the budget is enforced locally, before the call. `provider_spend` is an
-- append-only log of what we actually spent; `provider_spend_today` rolls it up
-- so the guard is one indexed query.
--
-- This is deliberately generic (`provider` is a text column) rather than
-- Bandsintown-specific: the Spotify proxy has the same shape of problem at
-- 1000/month, and should move onto this once it earns it.

create table if not exists provider_spend (
  id         bigserial primary key,
  provider   text not null,
  endpoint   text not null,
  credits    integer not null default 1,
  -- What the upstream said was left AFTER this call. Null when not reported.
  -- Lets us detect drift between our ledger and the real balance.
  remaining  integer,
  -- Null on a cache hit that we logged for observability; set on a real call.
  spent_at   timestamptz not null default now()
);

create index if not exists provider_spend_lookup
  on provider_spend (provider, spent_at desc);

alter table provider_spend enable row level security;
-- No policy: service-role only. Nothing in the browser needs to read this.

-- Credits spent per provider in the last 24 hours.
create or replace view provider_spend_today as
  select provider,
         sum(credits)::integer as credits_spent,
         count(*)::integer     as calls,
         max(spent_at)         as last_call,
         -- The most recent upstream-reported balance, for drift detection.
         (array_agg(remaining order by spent_at desc)
            filter (where remaining is not null))[1] as last_reported_remaining
    from provider_spend
   where spent_at > now() - interval '24 hours'
   group by provider;

-- Views inherit the RLS of their base tables under `security_invoker`, which is
-- what we want: service-role only, same as `provider_spend` itself.
alter view provider_spend_today set (security_invoker = on);

-- Trim the log. Called opportunistically, like `pruneSearchCache` — the daily
-- guard only ever looks back 24 hours, so a 30-day tail is generous.
create or replace function prune_provider_spend()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.provider_spend where spent_at < now() - interval '30 days';
$$;
