-- Take the `anon` role off the public schema entirely.
--
-- Found during the 2026-08-29 security audit. `email_accounts` stores encrypted
-- Google OAuth refresh tokens, and column-level grants correctly withheld
-- `access_token`, `refresh_token`, `token_expires` and `history_id` from
-- `authenticated` (that is what `0007` did). But `anon` still held the Supabase
-- defaults: SELECT, INSERT and UPDATE on **every column**, both tokens included.
--
-- This was not a live leak. RLS is enabled on the table and every policy is
-- scoped to `{authenticated}`, so an `anon` request matches no policy and gets
-- zero rows — confirmed empirically against prod, where the query succeeds and
-- returns nothing. The problem is that RLS was the *only* thing standing
-- between an unauthenticated caller and every refresh token in the system. One
-- permissive policy written for `public` instead of `authenticated`, or one
-- table shipped with RLS off, and the grant is suddenly load-bearing.
--
-- So this removes the second layer's dependence on the first.
--
-- Safe by construction: because RLS already yields zero rows to `anon` on every
-- table here, revoking the grant cannot change the result of any request that
-- works today. Nothing in the app reads the public schema unauthenticated — the
-- login page talks only to `auth`, and `middleware.ts` gates every other route.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Future tables must not silently re-grant it. Supabase's defaults are set for
-- the `postgres` role, which is what owns objects created by migrations.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;

-- `authenticated` keeps its column-level grants from `0001`/`0007` untouched;
-- this migration deliberately does not go near them.
