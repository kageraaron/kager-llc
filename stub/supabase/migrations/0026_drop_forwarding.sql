-- Drop the forward-to-inbox feature.
--
-- Stub was going to take ticket emails forwarded to a per-user address, via a
-- Cloudflare Email Worker posting to /api/ingest/forward. It never went live
-- (FEATURE_FORWARD_INBOX stayed false), and Gmail covers both people in the
-- household, so the route, the worker and the per-user addresses are gone.
--
-- Historic rows keep their 'forward' attendance_source value; the enum is left
-- alone because dropping an enum value means rebuilding the type.

drop trigger if exists on_profile_created_assign_inbox on profiles;
drop function if exists assign_inbound_address();
drop table if exists inbound_addresses;
