-- Month-to-date spend, because the Bandsintown quota is monthly.
--
-- `0014` shipped with only a 24-hour rollup, on the assumption that the ~200
-- credits were a one-off prepaid balance. They are not: the Parse free tier is
-- **200 credits per month**, resetting on the calendar month.
--
-- That makes a daily cap the wrong shape of guard on its own. A 25/day ceiling
-- permits 750 credits a month — 3.75x the actual allowance — so the budget could
-- be honoured every single day and still blow the month by a wide margin.
--
-- Both limits are now enforced, and they do different jobs:
--
--   * the MONTHLY cap is the real ceiling — it is the quota;
--   * the DAILY cap is a burst limiter, stopping one runaway afternoon (or one
--     enthusiastic user hammering "Search harder") from consuming the whole
--     month in an hour.
--
-- Whichever binds first wins.

create or replace view provider_spend_month as
  select provider,
         sum(credits)::integer as credits_spent,
         count(*)::integer     as calls,
         max(spent_at)         as last_call,
         (array_agg(remaining order by spent_at desc)
            filter (where remaining is not null))[1] as last_reported_remaining
    from provider_spend
   -- Calendar month in UTC. Parse resets on its own clock and we cannot see it,
   -- so this may drift from the upstream reset by a few hours. The headroom in
   -- BANDSINTOWN_MONTHLY_CREDITS (180 against a real 200) absorbs that.
   where spent_at >= date_trunc('month', now() at time zone 'utc')
   group by provider;

alter view provider_spend_month set (security_invoker = on);

-- The 30-day retention in `prune_provider_spend` is now load-bearing rather
-- than tidiness: trimming below a full calendar month would corrupt the
-- month-to-date total. 30 days is the minimum safe value; leave it alone.
