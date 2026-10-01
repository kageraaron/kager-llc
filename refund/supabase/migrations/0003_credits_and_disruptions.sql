-- Two more ways money comes back, beyond price drops.
--
-- 1. Travel credits. A claimed fare drop usually returns as an airline credit
--    with an expiry (a Delta eCredit lapses a year from the ORIGINAL purchase).
--    A credit nobody remembers is money lost, so each one gets a row here and a
--    reminder before it expires.
--
-- 2. Flight disruptions. US DOT rule (in effect 2024-10-28): a cancelled flight,
--    or one delayed 3+ hours domestic / 6+ hours international, is owed a cash
--    refund if the passenger doesn't take the alternative. Refund checks each
--    watched flight's status around departure; what it found is kept on the
--    purchase so a flight is asked about at most twice.

create table refund.credits (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,   -- whose name it's in
  issuer       text not null,                 -- policy id ('delta') or free text ('Hotel X')
  label        text not null,                 -- "Delta eCredit", "Southwest flight credit"
  amount_cents int,
  currency     text not null default 'USD',
  -- A credit number is as good as cash to whoever holds it. Optional, and only
  -- ever readable inside the household.
  code         text,
  expires_at   date,
  -- book_by: a new trip must be BOOKED by the date. travel_by: flown by it.
  rule         text not null default 'book_by' check (rule in ('book_by', 'travel_by')),
  status       text not null default 'active' check (status in ('active', 'used', 'expired')),
  purchase_id  uuid references refund.purchases(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index refund_credits_household on refund.credits (household_id, status, expires_at);

alter table refund.credits enable row level security;
create policy "household credits" on refund.credits
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
grant select, insert, update, delete on refund.credits to authenticated;
grant all on refund.credits to service_role;

-- Notifications can now be about a credit instead of a purchase.
alter table refund.notifications alter column purchase_id drop not null;
alter table refund.notifications add column credit_id uuid references refund.credits(id) on delete cascade;
alter table refund.notifications add constraint notifications_about_one
  check (num_nonnulls(purchase_id, credit_id) = 1);
create unique index refund_notifications_credit on refund.notifications (credit_id, key) where credit_id is not null;

-- Per-flight status results: { "AA2529@2026-11-24": { phase, status, delay_min, checked_at } }
alter table refund.purchases add column flight_status jsonb not null default '{}';
