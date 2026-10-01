-- A hard ceiling on metered provider calls.
--
-- JamBase's Developer plan is free for 1,000 requests a month and bills every
-- request after that. Nothing upstream stops at the free limit, so the stop
-- has to be here, BEFORE the request is sent.
--
-- `claim_provider_call` is check-and-record in one statement under an advisory
-- lock: two requests arriving together cannot both read "999 spent" and both
-- go. It returns false when either window is full, and the caller must not
-- make the request.
--
-- The month is a ROLLING 31 days, not the calendar month. The provider bills
-- on its own cycle, which we cannot see; a calendar-month cap would allow a
-- full month's calls on the 30th and another on the 1st, both inside one
-- billing period. Capping every 31-day span keeps any billing month under it.

create or replace function claim_provider_call(
  p_provider text,
  p_endpoint text,
  p_month_cap integer,
  p_day_cap integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  spent_month integer;
  spent_day integer;
begin
  perform pg_advisory_xact_lock(hashtext('provider_spend:' || p_provider));

  select coalesce(sum(credits), 0),
         coalesce(sum(credits) filter (where spent_at >= now() - interval '24 hours'), 0)
    into spent_month, spent_day
    from public.provider_spend
   where provider = p_provider
     and spent_at >= now() - interval '31 days';

  if spent_month + 1 > p_month_cap or spent_day + 1 > p_day_cap then
    return false;
  end if;

  insert into public.provider_spend (provider, endpoint, credits) values (p_provider, p_endpoint, 1);
  return true;
end;
$$;

revoke all on function claim_provider_call(text, text, integer, integer) from public, anon, authenticated;
grant execute on function claim_provider_call(text, text, integer, integer) to service_role;

-- The ledger was pruned at 30 days, one day short of the window above.
create or replace function prune_provider_spend()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.provider_spend where spent_at < now() - interval '35 days';
$$;
