-- JamBase start times were stored in the wrong zone.
--
-- JamBase reports a show's time as WALL time at the venue ("2026-10-02T20:00:00",
-- no offset). `resolveStart` passed that straight through, so it was saved as
-- 20:00 UTC and an 8pm San Francisco show rendered as 1:00 PM. The code now
-- resolves it against the venue's zone; this corrects the rows already written.
--
-- Which rows: every JamBase row with a known zone EXCEPT those sitting at
-- exactly 20:00 local. Those came from date-only listings, which took a
-- different (correct) path that anchors them at 8pm in the venue's zone.
-- Everything else was a wall time saved as UTC, so it is re-read as local.
--
-- Run once, with the code fix: rows written after it are already correct.

update events e
set starts_at = (e.starts_at at time zone 'UTC') at time zone z.tz
from (
  select e2.id, coalesce(e2.timezone, v.timezone) as tz
  from events e2
  left join venues v on v.id = e2.venue_id
  where e2.jambase_id is not null
) z
where z.id = e.id
  and z.tz is not null
  and to_char(e.starts_at at time zone z.tz, 'HH24:MI:SS') <> '20:00:00';
