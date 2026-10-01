-- Refund: purchases whose price may drop inside the merchant's own window.
--
-- Lives in its own `refund` schema inside the suite's Supabase, beside Stub's
-- tables in `public`. It reuses three things from `public`:
--   * households / household_members and current_household_id() (Stub 0025):
--     purchases belong to the household, like Stub's shows.
--   * email_accounts: the one Gmail connection both apps scan with.
--   * profiles: who added a purchase.
-- Push devices are NOT shared: a subscription belongs to one app's service
-- worker, and Stub's reminders must never land on Refund's (or the reverse).
--
-- Expose the schema to PostgREST: PGRST_DB_SCHEMAS must include `refund`.

create schema if not exists refund;
grant usage on schema refund to authenticated, service_role;

-- ============================================================ settings

create table refund.settings (
  household_id   uuid primary key references public.households(id) on delete cascade,
  -- Best Buy's price-match window is its return period: 15 days, 60 for Plus/Total.
  bestbuy_tier   text not null default 'standard' check (bestbuy_tier in ('standard', 'plus', 'total')),
  store_min_cents  int not null default 1000,
  flight_min_cents int not null default 3000,
  min_pct        numeric not null default 5,
  updated_at     timestamptz not null default now()
);

-- ============================================================ email

-- Every Gmail message Refund has looked at, so a scan never re-reads one.
-- Refund keeps its own record rather than Stub's history cursor: each app must
-- be free to scan without moving the other's place.
create table refund.messages (
  id               uuid primary key default gen_random_uuid(),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  household_id     uuid not null references public.households(id) on delete cascade,
  gmail_id         text not null,
  received_at      timestamptz,
  from_addr        text,
  subject          text,
  status           text not null check (status in ('purchase', 'review', 'ignored', 'error')),
  error            text,
  created_at       timestamptz not null default now(),
  unique (email_account_id, gmail_id)
);

create index refund_messages_household on refund.messages (household_id, status);

-- ============================================================ purchases

create table refund.purchases (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,   -- who it came from
  kind          text not null check (kind in ('retail', 'flight', 'hotel')),
  merchant      text not null,                 -- policy id, see src/lib/policies.ts
  merchant_name text,
  order_ref     text,                          -- order number / PNR / confirmation
  purchased_at  timestamptz not null,
  total_cents   int,
  currency      text not null default 'USD',
  -- watching: window open. review: parsed but unsure, needs a look.
  -- claimed / dismissed: the person decided. expired: window closed.
  status        text not null default 'watching'
                check (status in ('watching', 'review', 'claimed', 'dismissed', 'expired')),
  deadline_at   timestamptz,                   -- when the price-drop window closes
  next_check_at timestamptz,                   -- when the price job should look next
  -- Flight: { segments: [{carrier, flight, from, to, departs}], fare_brand, cabin, passengers }
  -- Hotel:  { property, city, check_in, check_out, refundable, cancel_by }
  details       jsonb not null default '{}',
  source        text not null default 'gmail' check (source in ('gmail', 'manual')),
  message_id    uuid references refund.messages(id) on delete set null,
  saved_cents   int not null default 0,        -- what a claim got back
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per order, however many emails mention it (shipped, delivered...).
create unique index refund_purchases_order
  on refund.purchases (household_id, merchant, order_ref) where order_ref is not null;
create index refund_purchases_due on refund.purchases (status, next_check_at);
create index refund_purchases_household on refund.purchases (household_id, status, deadline_at);

create table refund.items (
  id               uuid primary key default gen_random_uuid(),
  purchase_id      uuid not null references refund.purchases(id) on delete cascade,
  household_id     uuid not null references public.households(id) on delete cascade,
  title            text not null,
  sku              text,
  url              text,
  quantity         int not null default 1,
  unit_price_cents int,
  last_price_cents int,
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now()
);

create index refund_items_purchase on refund.items (purchase_id);

-- Price history: one row per check, for the chart and for "confirm before push".
create table refund.price_checks (
  id           bigint generated always as identity primary key,
  purchase_id  uuid not null references refund.purchases(id) on delete cascade,
  item_id      uuid references refund.items(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  checked_at   timestamptz not null default now(),
  price_cents  int,
  source       text not null,
  matched      boolean not null default true,  -- false: couldn't find the same flight/room/SKU
  note         text
);

create index refund_price_checks_purchase on refund.price_checks (purchase_id, checked_at desc);

-- Every push sent, keyed so each alert or reminder goes out once.
create table refund.notifications (
  id           bigint generated always as identity primary key,
  purchase_id  uuid not null references refund.purchases(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  key          text not null,                  -- 'drop:<cents>', 'remind:check', 'remind:closing'
  sent_at      timestamptz not null default now(),
  unique (purchase_id, key)
);

-- This app's own push devices.
create table refund.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index refund_push_user on refund.push_subscriptions (user_id);

-- ============================================================ RLS

alter table refund.settings           enable row level security;
alter table refund.messages           enable row level security;
alter table refund.purchases          enable row level security;
alter table refund.items              enable row level security;
alter table refund.price_checks       enable row level security;
alter table refund.notifications      enable row level security;
alter table refund.push_subscriptions enable row level security;

create policy "household settings" on refund.settings
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "household messages" on refund.messages
  for select to authenticated using (household_id = public.current_household_id());

create policy "household purchases" on refund.purchases
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "household items" on refund.items
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "household price checks" on refund.price_checks
  for select to authenticated using (household_id = public.current_household_id());

create policy "household notifications" on refund.notifications
  for select to authenticated using (household_id = public.current_household_id());

create policy "own push devices" on refund.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on refund.settings, refund.purchases, refund.items to authenticated;
grant select on refund.messages, refund.price_checks, refund.notifications to authenticated;
grant select, insert, update, delete on refund.push_subscriptions to authenticated;

grant all on all tables in schema refund to service_role;
grant usage, select on all sequences in schema refund to service_role;
