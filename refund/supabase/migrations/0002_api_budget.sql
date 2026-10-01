-- A monthly budget for metered price APIs (SerpApi: 250 free searches a month).
--
-- claim_api_call() is the gate: it counts a call only if the month's cap still
-- has room, atomically, so two runs can't both take the last search. Code calls
-- it BEFORE the request; a false means "don't call".

create table refund.api_usage (
  provider text not null,
  month    date not null,
  calls    int  not null default 0,
  primary key (provider, month)
);

alter table refund.api_usage enable row level security;
create policy "read api usage" on refund.api_usage for select to authenticated using (true);
grant select on refund.api_usage to authenticated;
grant all on refund.api_usage to service_role;

create or replace function refund.claim_api_call(p_provider text, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = refund
as $$
declare
  m date := date_trunc('month', now())::date;
  n int;
begin
  insert into api_usage (provider, month, calls) values (p_provider, m, 0)
  on conflict (provider, month) do nothing;

  update api_usage set calls = calls + 1
  where provider = p_provider and month = m and calls < p_cap
  returning calls into n;

  return n is not null;
end;
$$;

revoke all on function refund.claim_api_call(text, int) from public, anon, authenticated;
grant execute on function refund.claim_api_call(text, int) to service_role;
