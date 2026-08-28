-- Web push subscriptions.

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on push_subscriptions (user_id);

-- Tracks which reminders have already gone out, so a cron re-run cannot send
-- the same notification twice.
create table sent_reminders (
  user_id    uuid not null references profiles(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, event_id, kind)
);

alter table push_subscriptions enable row level security;
alter table sent_reminders     enable row level security;

create policy "own push subscriptions" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own reminders" on sent_reminders
  for select to authenticated using (user_id = auth.uid());
