-- Security hardening, from the Supabase database linter.
--
-- 1. handle_new_user() and assign_inbound_address() are trigger functions. They
--    were reachable at /rest/v1/rpc/<name> by anon and authenticated because
--    Postgres grants EXECUTE to PUBLIC by default. Triggers do not need any
--    EXECUTE grant to fire, so revoke it entirely.
--
-- 2. are_friends() is used inside an RLS policy, but as a SECURITY DEFINER
--    function it also let any caller ask whether two ARBITRARY users are
--    friends — a friendship-graph probe. Revoke public execute, and additionally
--    make the function refuse to answer about pairs the caller is not part of,
--    so it stays safe even if a grant is restored later.
--
--    Verified: the RLS policy on `attendances` still resolves correctly after
--    this, because it always passes auth.uid() as the first argument.
--
-- 3. touch_updated_at() had no pinned search_path.

revoke all on function public.handle_new_user()        from public, anon, authenticated;
revoke all on function public.assign_inbound_address()  from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid)   from public, anon;

create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Only answer about a pair the caller belongs to. The RLS policy always
    -- passes auth.uid() as `a`, so this is transparent there; a direct RPC
    -- probe of two other users now returns false instead of leaking.
    (auth.uid() is not distinct from a or auth.uid() is not distinct from b)
    and exists (
      select 1 from friendships
      where user_low  = least(a, b)
        and user_high = greatest(a, b)
        and status    = 'accepted'
    );
$$;

create or replace function touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
